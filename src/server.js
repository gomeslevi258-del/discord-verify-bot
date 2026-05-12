const express = require('express');
const { getPendingAssignment, markPendingProcessed, createProcessedAssignment } = require('./database');

/**
 * Inicia servidor interno HTTP para comunicação do site com o bot.
 * @param {import('discord.js').Client | undefined} incomingClient
 */
function startInternalServer(incomingClient) {
  // Mantém compatibilidade: prefere client injetado no bootstrap, com fallback opcional.
  let client = incomingClient;
  if (!client) {
    try {
      ({ client } = require('./index'));
      console.warn('[assign-role] Client Discord não foi passado ao servidor interno. Usando fallback via require(./index).');
    } catch (error) {
      console.error('[assign-role] Falha ao resolver client Discord por fallback:', error.message);
    }
  }
  const app = express();
  const port = Number(process.env.BOT_PORT) || 3001;

  app.use(express.json());

  // Middleware de autenticação simples por secret compartilhado.
  app.use((req, res, next) => {
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    const receivedSecret = req.headers['x-api-secret'];

    if (!expectedSecret) {
      console.error('INTERNAL_API_SECRET não configurado no bot.');
      return res.status(500).json({
        ok: false,
        error: 'internal_secret_not_configured',
      });
    }

    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
      });
    }

    next();
  });

  app.post('/internal/assign-role', async (req, res) => {
    const { token, discord_id: discordId } = req.body || {};

    console.log('[assign-role] Recebido request para adicionar cargo');

    if (!token || !discordId) {
      console.error('[assign-role] Campos obrigatórios ausentes', {
        hasToken: Boolean(token),
        hasDiscordId: Boolean(discordId),
      });

      return res.status(400).json({
        ok: false,
        error: 'missing_required_fields',
        message: 'Campos obrigatórios: token e discord_id.',
      });
    }

    if (!client) {
      console.error('[assign-role] Client Discord indisponível no servidor interno.');
      return res.status(503).json({
        ok: false,
        error: 'discord_client_unavailable',
      });
    }

    try {
      const assignment = await getPendingAssignment(token);

      if (!assignment) {
        console.error('[assign-role] Assignment não encontrado para token', { token });
        return res.status(404).json({
          ok: false,
          error: 'token_not_found',
        });
      }

      const guildId = assignment.guild_id;
      const roleId = assignment.role_id;

      console.log(`[assign-role] Discord ID: ${discordId}, Guild ID: ${guildId}, Role ID: ${roleId}`);

      if (!guildId || !roleId) {
        console.error('[assign-role] Guild/cargo ausentes na configuração.', { assignment });
        return res.status(409).json({
          ok: false,
          error: 'guild_config_incomplete',
          message: 'Guild/cargo não configurados para esse token.',
        });
      }

      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        console.error('[assign-role] Guild não encontrada no client do bot.', { guildId });
        return res.status(404).json({
          ok: false,
          error: 'guild_not_found',
        });
      }
      console.log('[assign-role] Guild encontrada com sucesso.');

      const member = await guild.members.fetch(discordId).catch((error) => {
        console.error('[assign-role] Falha ao buscar member.', {
          discordId,
          guildId,
          message: error.message,
          code: error.code,
        });
        return null;
      });

      if (!member) {
        return res.status(404).json({
          ok: false,
          error: 'member_not_found',
        });
      }
      console.log('[assign-role] Member encontrado com sucesso.');

      const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);

      if (!role) {
        console.error('[assign-role] Cargo configurado não encontrado na guild.', { roleId, guildId });
        return res.status(404).json({
          ok: false,
          error: 'role_not_found',
          message: 'Cargo configurado não encontrado na guild.',
        });
      }
      console.log('[assign-role] Role encontrada com sucesso.');

      try {
        await member.roles.add(role);
      } catch (error) {
        const missingPermissions = error.code === 50013 || /Missing Permissions/i.test(error.message || '');
        console.error('[assign-role] Erro ao adicionar cargo.', {
          discordId,
          guildId,
          roleId,
          code: error.code,
          message: error.message,
          missingPermissions,
        });

        return res.status(missingPermissions ? 403 : 500).json({
          ok: false,
          error: missingPermissions ? 'missing_permissions' : 'role_assignment_failed',
        });
      }

      console.log('[assign-role] Cargo adicionado com sucesso!');

      // Marca como processado na fila. Se não existir item pendente, cria já como processado.
      if (assignment.pending_id) {
        await markPendingProcessed(assignment.pending_id);
      } else {
        await createProcessedAssignment(token, discordId, guildId, roleId);
      }

      // Opcional: registra mensagem no canal de logs, se configurado.
      if (assignment.log_channel_id) {
        try {
          const logChannel = await client.channels.fetch(assignment.log_channel_id);
          if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`✅ Cargo <@&${roleId}> atribuído para <@${discordId}> via token \`${token}\`.`);
          }
        } catch (logError) {
          console.warn('Falha ao enviar log de atribuição de cargo:', logError.message);
        }
      }

      return res.json({
        ok: true,
        success: true,
        guild_id: guildId,
        role_id: roleId,
      });
    } catch (error) {
      console.error('Erro em /internal/assign-role:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
      });
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'discord-bot-internal-api' });
  });

  app.listen(port, () => {
    console.log(`Servidor interno do bot rodando em http://localhost:${port}`);
  });
}

module.exports = {
  startInternalServer,
};
