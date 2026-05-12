/**
 * database.js — Acessa o banco via API do site (verificamembro.com)
 * O banco é hospedado na Abacus AI e não aceita conexões externas.
 * Por isso, o bot faz chamadas HTTP para o site, que acessa o banco com Prisma.
 */

const SITE_URL = (process.env.SITE_URL || 'https://verificamembro.com').replace(/\/$/, '');
const API_SECRET = process.env.INTERNAL_API_SECRET || '';

const isMockDb = String(process.env.MOCK_DB || '').toLowerCase() === 'true';

// Stores em memória para desenvolvimento sem PostgreSQL.
const guildConfigStore = new Map();
const mockTokenStore = new Map();

if (isMockDb) {
  console.log('[database] MOCK_DB=true ativo no bot. Usando Map em memória.');
} else {
  console.log(`[database] Modo API ativo. Chamando ${SITE_URL}/api/bot/...`);
}

/**
 * Faz uma requisição HTTP para a API do site.
 */
async function apiCall(method, path, body = null) {
  const url = `${SITE_URL}${path}`;
  const headers = {
    'x-api-secret': API_SECRET,
    'Content-Type': 'application/json',
  };

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API ${method} ${path} falhou (${response.status}): ${data.error || JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Busca configuração de uma guild.
 * @param {string} guildId
 */
async function getGuildConfig(guildId) {
  if (isMockDb) {
    const config = guildConfigStore.get(guildId) || null;
    return Promise.resolve(config);
  }

  const result = await apiCall('GET', `/api/bot/guild-config?guildId=${encodeURIComponent(guildId)}`);
  
  if (!result.data) return null;
  
  // Map Prisma field names to snake_case for compatibility with bot code
  return {
    guild_id: result.data.guildId,
    verified_role_id: result.data.verifiedRoleId,
    log_channel_id: result.data.logChannelId,
    verify_channel_id: result.data.verifyChannelId,
    webhook_url: result.data.webhookUrl,
    created_at: result.data.createdAt,
    updated_at: result.data.updatedAt,
  };
}

/**
 * Salva (upsert) configuração da guild.
 * @param {string} guildId
 * @param {{verified_role_id: string, verify_channel_id: string, log_channel_id: string}} config
 */
async function saveGuildConfig(guildId, config) {
  if (isMockDb) {
    const now = new Date().toISOString();
    const current = guildConfigStore.get(guildId);
    const payload = {
      guild_id: guildId,
      verified_role_id: config.verified_role_id,
      verify_channel_id: config.verify_channel_id,
      log_channel_id: config.log_channel_id,
      webhook_url: current?.webhook_url || null,
      created_at: current?.created_at || now,
      updated_at: now,
    };
    guildConfigStore.set(guildId, payload);
    return Promise.resolve(payload);
  }

  const result = await apiCall('POST', '/api/bot/guild-config', {
    guildId,
    verifiedRoleId: config.verified_role_id,
    verifyChannelId: config.verify_channel_id,
    logChannelId: config.log_channel_id,
  });

  return {
    guild_id: result.data.guildId,
    verified_role_id: result.data.verifiedRoleId,
    verify_channel_id: result.data.verifyChannelId,
    log_channel_id: result.data.logChannelId,
    updated_at: result.data.updatedAt,
  };
}

/**
 * Cria token de verificação.
 * @param {string} token
 * @param {string} guildId
 * @param {string} userId
 * @param {Date|string|number} expiresAt
 */
async function createToken(token, guildId, userId, expiresAt) {
  if (isMockDb) {
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    const payload = {
      success: true,
      id: null,
      token,
      guild_id: guildId,
      user_id: userId,
      discord_user_id: userId,
      expires_at: expiry.toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
      mock: true,
    };
    mockTokenStore.set(token, payload);
    return Promise.resolve(payload);
  }

  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  const result = await apiCall('POST', '/api/bot/token', {
    token,
    guildId,
    userId,
    expiresAt: expiry.toISOString(),
  });

  return result.data;
}

/**
 * Recupera dados necessários para atribuição de cargo a partir do token.
 * @param {string} token
 */
async function getPendingAssignment(token) {
  if (isMockDb) {
    const tokenRow = mockTokenStore.get(token);

    if (tokenRow) {
      const guildConfig = guildConfigStore.get(tokenRow.guild_id);
      if (!guildConfig?.verified_role_id) return Promise.resolve(null);

      return Promise.resolve({
        token,
        guild_id: tokenRow.guild_id,
        role_id: guildConfig.verified_role_id,
        log_channel_id: guildConfig.log_channel_id || null,
        pending_id: null,
        pending_discord_id: tokenRow.discord_user_id || null,
        processed: false,
        mock: true,
        mock_fallback: false,
      });
    }

    if (guildConfigStore.size === 1) {
      const [[guildId, guildConfig]] = Array.from(guildConfigStore.entries());
      if (!guildConfig?.verified_role_id) return Promise.resolve(null);

      console.warn('[database][MOCK_DB] Token não encontrado. Fallback com guild configurada.');

      return Promise.resolve({
        token,
        guild_id: guildId,
        role_id: guildConfig.verified_role_id,
        log_channel_id: guildConfig.log_channel_id || null,
        pending_id: null,
        pending_discord_id: null,
        processed: false,
        mock: true,
        mock_fallback: true,
      });
    }

    return Promise.resolve(null);
  }

  const result = await apiCall('GET', `/api/bot/token?token=${encodeURIComponent(token)}`);
  return result.data;
}

/**
 * Marca um pending assignment como processado.
 */
async function markPendingProcessed(pendingId) {
  return apiCall('POST', '/api/bot/pending-assignment', {
    action: 'markProcessed',
    pendingId,
  });
}

/**
 * Cria um pending assignment já processado.
 */
async function createProcessedAssignment(token, discordId, guildId, roleId) {
  return apiCall('POST', '/api/bot/pending-assignment', {
    action: 'createProcessed',
    token,
    discordId,
    guildId,
    roleId,
  });
}

module.exports = {
  pool: null,
  query: async () => ({ rows: [], rowCount: 0 }),
  getGuildConfig,
  saveGuildConfig,
  createToken,
  getPendingAssignment,
  markPendingProcessed,
  createProcessedAssignment,
};
