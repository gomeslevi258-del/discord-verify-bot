const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { saveGuildConfig } = require('../database');

const VERIFY_BANNER_URL =
  'ht'
  + 'tps'
  + '://'
  + 'cdn'
  + '.'
  + 'discordapp'
  + '.com/attachments/'
  + '1502438164197806163/1503493661479145482/Se_verifique.png';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura canal de verificação, cargo e canal de logs.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('canal')
        .setDescription('Canal onde será enviada a mensagem de verificação')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName('cargo')
        .setDescription('Cargo que será atribuído após verificação')
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName('canal_log')
        .setDescription('Canal de logs para ações do bot')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  async execute(interaction) {
    // DeferReply IMEDIATAMENTE para evitar timeout de 3s do Discord
    await interaction.deferReply({ ephemeral: true });

    try {
      const verifyChannel = interaction.options.getChannel('canal', true);
      const role = interaction.options.getRole('cargo', true);
      const logChannel = interaction.options.getChannel('canal_log', true);

      console.log(`[setup] Guild: ${interaction.guildId}, Canal: ${verifyChannel.id}, Cargo: ${role.id}, Log: ${logChannel.id}`);

      // Salva a configuração no banco para uso no endpoint interno.
      await saveGuildConfig(interaction.guildId, {
        verified_role_id: role.id,
        verify_channel_id: verifyChannel.id,
        log_channel_id: logChannel.id,
      });

      console.log('[setup] Configuração salva no banco com sucesso.');

      const embed = new EmbedBuilder()
        .setTitle('🔐 Verificação de Membro')
        .setDescription(
          '**Bem-vindo(a) ao servidor!**\n\n'
          + 'Para ter acesso a todos os canais, você precisa se verificar.\n'
          + 'É rápido e seguro! Clique no botão abaixo para começar.\n\n'
          + '**Como funciona:**\n'
          + '✅ Clique em "Verificar"\n'
          + '✅ Conecte sua conta Discord\n'
          + '✅ Pronto! Acesso liberado\n\n'
          + '*A verificação é feita através do Discord oficial.*'
        )
        .setColor(0x5865F2)
        .setImage(VERIFY_BANNER_URL)
        .setFooter({ text: 'Sistema de verificação seguro' })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('✅ Verificar')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await verifyChannel.send({
        embeds: [embed],
        components: [row],
      });

      console.log('[setup] Mensagem de verificação enviada no canal.');

      await interaction.editReply({
        content: `✅ Configuração salva com sucesso. Mensagem enviada em ${verifyChannel}.`,
      });
    } catch (error) {
      console.error('Erro ao executar /setup:', error);

      await interaction.editReply({
        content: '❌ Não foi possível concluir o setup. Verifique permissões e tente novamente.',
      });
    }
  },
};
