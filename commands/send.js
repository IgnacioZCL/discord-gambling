const { transfer } = require('../lib/economy');

module.exports = {
  name: 'send',
  description: 'Send money to another Discord user. Usage: !send <amount> @user',
  async execute(message, args) {
    const amountInput = args[0];
    if (!amountInput) {
      return message.reply('❌ Usage: `!send <amount> @user`');
    }

    const amount = parseInt(amountInput.replace(/[^0-9]/g, ''), 10);
    if (Number.isNaN(amount) || amount <= 0) {
      return message.reply('❌ Please provide a valid positive amount.');
    }

    const recipient = message.mentions.users.first();
    if (!recipient) {
      return message.reply('❌ You must mention the user you want to send money to.');
    }
    if (recipient.id === message.author.id) {
      return message.reply('❌ You cannot send money to yourself.');
    }
    if (recipient.bot) {
      return message.reply('❌ You cannot send money to a bot.');
    }

    try {
      const result = transfer(message.author.id, recipient.id, amount, `Transfer between users`);

      await message.channel.send(
        `💸 **${message.author.username}** sent **$${amount.toLocaleString()}** to **${recipient.username}**.\n` +
        `💰 Your new balance: **$${result.senderNewBalance.toLocaleString()}**\n` +
        `${recipient.username}'s new balance: **$${result.recipientNewBalance.toLocaleString()}**`
      );
    } catch (error) {
      await message.reply(`❌ ${error.message}`);
    }
  },
};
