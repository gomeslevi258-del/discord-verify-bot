require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Collection,
} = require('discord.js');
const { validateBotEnv } = require('../validate-env');
const { startInternalServer } = require('./server');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

/**
 * Carrega dinamicamente todos os comandos em /commands.
 */
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command.data || !command.execute) {
      console.warn(`Comando ignorado (formato inválido): ${file}`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }

  console.log(`${client.commands.size} comando(s) carregado(s).`);
}

/**
 * Carrega eventos em /events.
 */
function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (!event.name || !event.execute) {
      console.warn(`Evento ignorado (formato inválido): ${file}`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  console.log(`${eventFiles.length} evento(s) carregado(s).`);
}

async function bootstrap() {
  try {
    if (!validateBotEnv()) {
      console.error('Encerrando inicialização do bot por falta de variáveis obrigatórias.');
      process.exit(1);
    }

    loadCommands();
    loadEvents();

    startInternalServer(client);

    await client.login(process.env.BOT_TOKEN);
  } catch (error) {
    console.error('Falha ao iniciar bot:', error);
    process.exit(1);
  }
}

bootstrap();

module.exports = {
  client,
};
