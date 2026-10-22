const db = require('./db');

const INITIAL_BALANCE = 5000;
const CLAIM_AMOUNT = 1000;
const CLAIM_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function getOrCreateUser(userId) {
  let user = db
    .prepare('SELECT user_id, balance, last_claim_at, created_at FROM users WHERE user_id = ?')
    .get(userId);

  if (!user) {
    const insert = db.prepare(
      'INSERT INTO users (user_id, balance, last_claim_at) VALUES (?, ?, ?)'
    );
    const now = new Date().toISOString();
    // last_claim_at is null so the user can claim immediately after joining.
    insert.run(userId, INITIAL_BALANCE, null);

    // Record the initial grant as a transaction.
    db.prepare(
      'INSERT INTO transactions (user_id, amount, type, game, description, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, INITIAL_BALANCE, 'initial', null, 'Initial balance', INITIAL_BALANCE);

    user = {
      user_id: userId,
      balance: INITIAL_BALANCE,
      last_claim_at: null,
      created_at: now,
    };
  }

  return user;
}

function getBalance(userId) {
  const user = getOrCreateUser(userId);
  return user.balance;
}

function getHistory(userId, limit = 10) {
  getOrCreateUser(userId);
  return db
    .prepare(
      'SELECT id, amount, type, game, description, balance_after, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    )
    .all(userId, limit);
}

function formatRemaining(ms) {
  if (ms <= 0) return '0s';

  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

function claim(userId) {
  const user = getOrCreateUser(userId);
  const now = Date.now();
  const lastClaim = user.last_claim_at ? new Date(user.last_claim_at).getTime() : 0;
  const nextClaimAt = user.last_claim_at ? lastClaim + CLAIM_COOLDOWN_MS : now;

  if (now < nextClaimAt) {
    return {
      success: false,
      amount: 0,
      nextClaimAt,
      remainingMs: nextClaimAt - now,
      balance: user.balance,
    };
  }

  const newBalance = user.balance + CLAIM_AMOUNT;
  const nowIso = new Date(now).toISOString();

  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET balance = ?, last_claim_at = ?, updated_at = ? WHERE user_id = ?').run(
      newBalance,
      nowIso,
      nowIso,
      userId
    );
    db.prepare(
      'INSERT INTO transactions (user_id, amount, type, game, description, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, CLAIM_AMOUNT, 'claim', null, 'Hourly claim', newBalance);
  });

  transaction();

  return {
    success: true,
    amount: CLAIM_AMOUNT,
    nextClaimAt: now + CLAIM_COOLDOWN_MS,
    remainingMs: CLAIM_COOLDOWN_MS,
    balance: newBalance,
  };
}

function placeBet(userId, amount, game, description) {
  const user = getOrCreateUser(userId);

  if (amount <= 0) {
    throw new Error('Bet amount must be positive.');
  }
  if (amount > user.balance) {
    throw new Error('Insufficient balance.');
  }

  const newBalance = user.balance - amount;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE user_id = ?').run(
      newBalance,
      now,
      userId
    );
    db.prepare(
      'INSERT INTO transactions (user_id, amount, type, game, description, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, -amount, 'bet', game, description || `${game} bet`, newBalance);
  });

  transaction();

  return {
    previousBalance: user.balance,
    newBalance,
    amount,
  };
}

function addReward(userId, amount, game, description) {
  if (amount <= 0) {
    throw new Error('Reward amount must be positive.');
  }

  const user = getOrCreateUser(userId);
  const newBalance = user.balance + amount;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE user_id = ?').run(
      newBalance,
      now,
      userId
    );
    db.prepare(
      'INSERT INTO transactions (user_id, amount, type, game, description, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, amount, 'win', game, description || `${game} win`, newBalance);
  });

  transaction();

  return {
    previousBalance: user.balance,
    newBalance,
    amount,
  };
}

function refundBet(userId, amount, game, description) {
  if (amount <= 0) {
    throw new Error('Refund amount must be positive.');
  }

  const user = getOrCreateUser(userId);
  const newBalance = user.balance + amount;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE user_id = ?').run(
      newBalance,
      now,
      userId
    );
    db.prepare(
      'INSERT INTO transactions (user_id, amount, type, game, description, balance_after) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, amount, 'push', game, description || `${game} push`, newBalance);
  });

  transaction();

  return {
    previousBalance: user.balance,
    newBalance,
    amount,
  };
}

module.exports = {
  INITIAL_BALANCE,
  CLAIM_AMOUNT,
  CLAIM_COOLDOWN_MS,
  getOrCreateUser,
  getBalance,
  getHistory,
  formatRemaining,
  claim,
  placeBet,
  addReward,
  refundBet,
};
