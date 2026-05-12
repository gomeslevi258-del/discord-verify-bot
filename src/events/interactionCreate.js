const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createToken, getGuildConfig } = require('../database');
const { generateToken } = require('../utils/generateToken');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // 1) Handler de slash commands.
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Erro ao executar comando /${interaction.commandName}:`, error);

        const payload = {
          content: '❌ Ocorreu um erro ao executar este comando.',
          ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      }

      return;
    }

    // 2) Handler do botão de verificação.
    if (!interaction.isButton() || interaction.customId !== 'verify_button') {
      return;
    }

    if (!interaction.guildId) {
      return interaction.reply({
        content: '❌ Este botão só pode ser usado dentro de uma guild.',
        ephemeral: true,
      });
    }

    try {
      const guildConfig = await getGuildConfig(interaction.guildId);

      if (!guildConfig || !guildConfig.verified_role_id) {
        return interaction.reply({
          content: '⚠️ A guild ainda não foi configurada. Peça para um admin usar `/setup`.',
          ephemeral: true,
        });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + (10 * 60 * 1000));

      await createToken(token, interaction.guildId, interaction.user.id, expiresAt);

      const siteUrl = process.env.SITE_URL;

      if (!siteUrl) {
        return interaction.reply({
          content: '❌ SITE_URL não está configurada no ambiente do bot.',
          ephemeral: true,
        });
      }

      const verifyLink = `${siteUrl.replace(/\/$/, '')}/verify?token=${token}`;

      const verifyButton = new ButtonBuilder()
        .setLabel('🔐 Verificar Agora')
        .setStyle(ButtonStyle.Link)
        .setURL(verifyLink);

      const row = new ActionRowBuilder().addComponents(verifyButton);

      return interaction.reply({
        content: 'Clique no botão abaixo para se verificar:',
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Erro ao processar botão verify_button:', error);

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: '❌ Ocorreu um erro ao gerar seu link de verificação.',
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: '❌ Ocorreu um erro ao gerar seu link de verificação.',
        ephemeral: true,
      });
    }
  },
};
