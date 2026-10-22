const { claim, formatRemaining } = require('../lib/economy');

module.exports = {
  name: 'claim',
  description: 'Claim $1000 every hour',
  async execute(message) {
    const result = claim(message.author.id);

    if (result.success) {
      await message.channel.send(
        `✅ **$${result.amount.toLocaleString()} claimed!**\n💰 New balance: **$${result.balance.toLocaleString()}**\n⏰ Next claim in 1 hour.`
      );
    } else {
      await message.channel.send(
        `⏰ You already claimed your hourly reward. You can claim again in **${formatRemaining(result.remainingMs)}**.`
      );
    }
  },
};
