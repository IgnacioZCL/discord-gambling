const { readdirSync } = require('fs');
const { join } = require('path');

module.exports = {
  name: 'help',
  description: 'Show the list of available economy and gambling commands',
  async execute(message, args, prefix) {
    const commandsPath = join(__dirname);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commandList = commandFiles
      .map(file => {
        const command = require(join(commandsPath, file));
        return { name: command.name, description: command.description };
      })
      .filter(cmd => cmd.name && cmd.description)
      .sort((a, b) => a.name.localeCompare(b.name));

    let text = `🎰 **discord-gambling commands**\n\n`;
    text += commandList
      .map(cmd => `\`${prefix}${cmd.name}\` — ${cmd.description}`)
      .join('\n');

    await message.channel.send(text);
  },
};
