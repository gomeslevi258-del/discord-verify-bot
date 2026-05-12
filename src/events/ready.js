const { REST, Routes } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Bot online como ${client.user.username}`);

    const token = process.env.BOT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

    if (!token || !clientId) {
      console.warn('Não foi possível registrar slash commands: BOT_TOKEN e/ou DISCORD_CLIENT_ID/CLIENT_ID ausentes.');
      return;
    }

    const commands = [...client.commands.values()].map((command) => command.data.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    const guildId = process.env.GUILD_ID;

    try {
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
          body: commands,
        });
        console.log(`Slash commands registradas na guild ${guildId}.`);
      } else {
        await rest.put(Routes.applicationCommands(clientId), {
          body: commands,
        });
        console.log('Slash commands registradas globalmente.');
      }
    } catch (error) {
      console.error('Erro ao registrar slash commands:', error);
    }
  },
};
