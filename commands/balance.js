const { getOrCreateUser, formatRemaining } = require('../lib/economy');

module.exports = {
  name: 'balance',
  description: 'Check your wallet balance and next claim availability',
  async execute(message) {
    const user = getOrCreateUser(message.author.id);
    const now = Date.now();
    const lastClaim = user.last_claim_at ? new Date(user.last_claim_at).getTime() : 0;
    const nextClaim = user.last_claim_at ? lastClaim + 60 * 60 * 1000 : now;
    const remaining = Math.max(0, nextClaim - now);

    let text = `💰 **Balance**: $${user.balance.toLocaleString()}`;
    if (remaining > 0) {
      text += `\n⏰ **Next claim** in ${formatRemaining(remaining)}.`;
    } else {
      text += `\n✅ You can claim now with \`!claim\`.`;
    }

    await message.channel.send(text);
  },
};
