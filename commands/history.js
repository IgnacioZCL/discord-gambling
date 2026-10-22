const { getHistory } = require('../lib/economy');

module.exports = {
  name: 'history',
  description: 'Show your recent economy transactions',
  async execute(message, args) {
    const limit = Math.min(parseInt(args[0], 10) || 10, 50);
    const rows = getHistory(message.author.id, limit);

    if (rows.length === 0) {
      return message.reply('📭 No transactions yet.');
    }

    let text = `📜 **Transaction history** (last ${rows.length})\n\n`;
    text += rows
      .map((row) => {
        const sign = row.amount >= 0 ? '+' : '';
        const game = row.game ? `[${row.game}] ` : '';
        return `\`${row.id}\` ${game}${sign}$${row.amount.toLocaleString()} → **$${row.balance_after.toLocaleString()}** — *${row.type}* (${row.created_at})`;
      })
      .join('\n');

    await message.channel.send(text);
  },
};
