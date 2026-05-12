const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const { getGuildConfig } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Mostra a configuração atual do sistema de verificação.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const config = await getGuildConfig(interaction.guildId);

      if (!config) {
        return interaction.reply({
          content: '⚠️ Esta guild ainda não foi configurada. Use `/setup` primeiro.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⚙️ Configuração atual')
        .addFields(
          {
            name: 'Guild ID',
            value: `\`${config.guild_id}\``,
            inline: false,
          },
          {
            name: 'Canal de verificação',
            value: config.verify_channel_id ? `<#${config.verify_channel_id}>` : 'Não definido',
            inline: true,
          },
          {
            name: 'Canal de logs',
            value: config.log_channel_id ? `<#${config.log_channel_id}>` : 'Não definido',
            inline: true,
          },
          {
            name: 'Cargo verificado',
            value: config.verified_role_id ? `<@&${config.verified_role_id}>` : 'Não definido',
            inline: true,
          }
        )
        .setFooter({
          text: `Atualizado em ${new Date(config.updated_at).toLocaleString('pt-BR')}`,
        });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Erro ao executar /config:', error);
      return interaction.reply({
        content: '❌ Erro ao buscar configuração da guild.',
        ephemeral: true,
      });
    }
  },
};
