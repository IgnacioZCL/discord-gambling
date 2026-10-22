const { placeBet, addReward, refundBet, getBalance } = require('../lib/economy');

const activeGames = new Map();

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MIN_BET = 100;

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function handValue(hand) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    value += cardValue(card);
    if (card.rank === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function formatHand(hand, hideFirst = false) {
  const cards = hand.map((card, index) => {
    if (hideFirst && index === 0) return '🂠';
    return `${card.rank}${card.suit}`;
  });
  return cards.join(' ');
}

function dealInitial(deck) {
  return {
    player: [deck.pop(), deck.pop()],
    dealer: [deck.pop(), deck.pop()],
    deck,
  };
}

function createHand(cards, bet) {
  return {
    cards,
    bet,
    status: 'playing', // playing | stood | bust | blackjack | push | win | loss
    resultAmount: 0,
  };
}

function dealerShouldHit(dealerHand) {
  return handValue(dealerHand) < 17;
}

async function sendTable(message, game, showDealer = false, footer = '') {
  const dealerValue = showDealer ? handValue(game.dealerHand) : '?';

  let text = `🃏 **Blackjack** — Bet: $${game.hands[0].bet.toLocaleString()}\n`;
  text += `Dealer: ${formatHand(game.dealerHand, !showDealer)} (${dealerValue})\n`;

  for (let i = 0; i < game.hands.length; i++) {
    const hand = game.hands[i];
    const marker = i === game.currentHandIndex && hand.status === 'playing' ? '▶️' : '  ';
    const handName = game.hands.length > 1 ? `Hand ${i + 1}` : 'You';
    text += `${marker} ${handName}: ${formatHand(hand.cards)} (${handValue(hand.cards)})`;
    if (hand.status !== 'playing') {
      text += ` — *${hand.status}*`;
    }
    text += '\n';
  }

  if (footer) text += `\n${footer}`;

  await message.channel.send(text);
}

function canSplit(hand, balance) {
  if (hand.cards.length !== 2) return false;
  if (hand.cards[0].rank !== hand.cards[1].rank) return false;
  // Need enough balance to place an identical bet for the new hand.
  return balance >= hand.bet;
}

function formatActions(game) {
  const hand = game.hands[game.currentHandIndex];
  const actions = ['`hit`', '`stand`'];
  if (canSplit(hand, game.playerBalanceAtStart)) {
    actions.push('`split`');
  }
  return `Send ${actions.join(', ')}.`;
}

function finishGameIfDone(message, game) {
  const allDone = game.hands.every(
    (h) => h.status === 'stood' || h.status === 'bust' || h.status === 'blackjack'
  );
  if (allDone) {
    resolveGame(message, game);
    return true;
  }
  return false;
}

function moveToNextHand(game) {
  for (let i = game.currentHandIndex + 1; i < game.hands.length; i++) {
    if (game.hands[i].status === 'playing') {
      game.currentHandIndex = i;
      return true;
    }
  }
  return false;
}

async function advanceToPlayingHand(message, game) {
  const current = game.hands[game.currentHandIndex];
  if (current && current.status === 'playing') return true;

  if (finishGameIfDone(message, game)) return false;

  while (moveToNextHand(game)) {
    const next = game.hands[game.currentHandIndex];
    if (handValue(next.cards) === 21) {
      next.status = 'stood';
      if (finishGameIfDone(message, game)) return false;
      continue;
    }
    return true;
  }

  await resolveGame(message, game);
  return false;
}

async function resolveGame(message, game) {
  if (game.finished) return;
  game.finished = true;

  // Dealer draws.
  while (dealerShouldHit(game.dealerHand) && handValue(game.dealerHand) <= 21) {
    game.dealerHand.push(game.deck.pop());
  }

  const dealerValue = handValue(game.dealerHand);
  const dealerBust = dealerValue > 21;

  let resultLines = [];

  for (let i = 0; i < game.hands.length; i++) {
    const hand = game.hands[i];
    const handValueNum = handValue(hand.cards);
    const handName = game.hands.length > 1 ? `Hand ${i + 1}` : 'You';

    if (hand.status === 'bust') {
      hand.status = 'loss';
      hand.resultAmount = 0;
      resultLines.push(`${handName}: 💥 Bust! You lose $${hand.bet.toLocaleString()}.`);
      continue;
    }

    if (isBlackjack(hand.cards) && hand.cards.length === 2 && !game.playerSplit) {
      if (isBlackjack(game.dealerHand)) {
        // Both player and dealer have blackjack: push.
        refundBet(message.author.id, hand.bet, 'blackjack', 'Blackjack push');
        hand.status = 'push';
        hand.resultAmount = hand.bet;
        resultLines.push(`${handName}: 🤝 Both have blackjack! Push. Your bet is returned.`);
      } else {
        // Natural blackjack on initial deal pays 3:2.
        const payout = Math.floor(hand.bet * 2.5);
        addReward(message.author.id, payout, 'blackjack', 'Blackjack natural 3:2');
        hand.status = 'blackjack';
        hand.resultAmount = payout;
        resultLines.push(`${handName}: 🏆 Blackjack! You win $${(payout - hand.bet).toLocaleString()}.`);
      }
      continue;
    }

    if (dealerBust || handValueNum > dealerValue) {
      const payout = hand.bet * 2;
      addReward(message.author.id, payout, 'blackjack', 'Blackjack win');
      hand.status = 'win';
      hand.resultAmount = payout;
      resultLines.push(`${handName}: 🏆 You win $${hand.bet.toLocaleString()}!`);
    } else if (handValueNum === dealerValue) {
      refundBet(message.author.id, hand.bet, 'blackjack', 'Blackjack push');
      hand.status = 'push';
      hand.resultAmount = hand.bet;
      resultLines.push(`${handName}: 🤝 Push. Your bet is returned.`);
    } else {
      hand.status = 'loss';
      hand.resultAmount = 0;
      resultLines.push(`${handName}: ❌ Dealer wins. You lose $${hand.bet.toLocaleString()}.`);
    }
  }

  activeGames.delete(game.gameKey);

  await sendTable(message, game, true, resultLines.join('\n'));
}

async function finishHand(message, game) {
  const hasPlayingHand = await advanceToPlayingHand(message, game);
  if (!hasPlayingHand && !game.finished) {
    await resolveGame(message, game);
    return;
  }
  if (!game.finished) {
    await sendTable(message, game, false, formatActions(game));
  }
}

module.exports = {
  name: 'blackjack',
  description: 'Play blackjack against the bot. Usage: !blackjack <bet> (min $100)',
  async execute(message, args) {
    const gameKey = `${message.guild.id}-${message.channel.id}-${message.author.id}`;

    if (activeGames.has(gameKey)) {
      return message.reply('❌ You already have a blackjack game in progress. Finish it first.');
    }

    const betInput = args[0];
    if (!betInput) {
      return message.reply('❌ You must place a bet. Usage: `!blackjack <bet>` (minimum $100).');
    }

    const bet = parseInt(betInput, 10);
    if (Number.isNaN(bet) || bet < MIN_BET) {
      return message.reply(`❌ Minimum bet is $${MIN_BET.toLocaleString()}.`);
    }

    const balance = getBalance(message.author.id);
    if (bet > balance) {
      return message.reply(`❌ You only have $${balance.toLocaleString()}.`);
    }

    // Deduct the initial bet.
    placeBet(message.author.id, bet, 'blackjack', 'Blackjack initial bet');

    const deck = shuffle(createDeck());
    const { player, dealer, deck: remainingDeck } = dealInitial(deck);

    const game = {
      gameKey,
      message,
      deck: remainingDeck,
      dealerHand: dealer,
      hands: [createHand(player, bet)],
      currentHandIndex: 0,
      playerBalanceAtStart: balance - bet,
      playerSplit: false,
      finished: false,
    };

    activeGames.set(gameKey, game);

    // Check for natural blackjack.
    if (isBlackjack(game.hands[0].cards)) {
      await resolveGame(message, game);
      return;
    }

    await sendTable(message, game, false, formatActions(game));

    const filter = (msg) =>
      msg.author.id === message.author.id &&
      ['hit', 'stand', 'h', 's', 'split', 'sp'].includes(msg.content.trim().toLowerCase());

    const collector = message.channel.createMessageCollector({ filter, time: 10 * 60 * 1000 });

    collector.on('collect', async (msg) => {
      if (game.finished) {
        collector.stop();
        return;
      }

      const hasPlayingHand = await advanceToPlayingHand(message, game);
      if (!hasPlayingHand) {
        if (game.finished) collector.stop();
        return;
      }

      const action = msg.content.trim().toLowerCase();
      const hand = game.hands[game.currentHandIndex];

      if (action === 'hit' || action === 'h') {
        hand.cards.push(game.deck.pop());
        const value = handValue(hand.cards);

        if (value > 21) {
          hand.status = 'bust';
          await sendTable(message, game, false, `💥 Hand ${game.currentHandIndex + 1} bust!`);
          await finishHand(message, game);
          if (game.finished) collector.stop();
          return;
        }

        if (value === 21) {
          hand.status = 'stood';
          await finishHand(message, game);
          if (game.finished) collector.stop();
          return;
        }

        await sendTable(message, game, false, formatActions(game));
      } else if (action === 'stand' || action === 's') {
        hand.status = 'stood';
        await finishHand(message, game);
        if (game.finished) collector.stop();
      } else if (action === 'split' || action === 'sp') {
        if (!canSplit(hand, game.playerBalanceAtStart)) {
          await message.reply('❌ You cannot split this hand. Need two cards of the same rank and enough balance.');
          return;
        }

        // Deduct additional bet for the split hand.
        placeBet(message.author.id, hand.bet, 'blackjack', 'Blackjack split bet');
        game.playerBalanceAtStart -= hand.bet;
        game.playerSplit = true;

        const card1 = hand.cards[0];
        const card2 = hand.cards[1];
        const newCard1 = game.deck.pop();
        const newCard2 = game.deck.pop();

        const newHand1 = createHand([card1, newCard1], hand.bet);
        const newHand2 = createHand([card2, newCard2], hand.bet);

        game.hands.splice(game.currentHandIndex, 1, newHand1, newHand2);

        // Auto-stand on 21 after split.
        if (handValue(newHand1.cards) === 21) newHand1.status = 'stood';
        if (handValue(newHand2.cards) === 21) newHand2.status = 'stood';

        const stillPlaying = await advanceToPlayingHand(message, game);
        if (stillPlaying) {
          await sendTable(message, game, false, formatActions(game));
        } else if (game.finished) {
          collector.stop();
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time' && activeGames.has(gameKey)) {
        message.channel
          .send('⏰ Blackjack game timed out due to inactivity. Standing on all hands.')
          .catch(() => {});
        for (const hand of game.hands) {
          if (hand.status === 'playing') hand.status = 'stood';
        }
        resolveGame(message, game).catch(() => {});
      }
    });
  },
};
