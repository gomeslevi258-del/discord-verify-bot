const { Pool } = require('pg');
const crypto = require('crypto');

const isMockDb = String(process.env.MOCK_DB || '').toLowerCase() === 'true';

/**
 * Gera um ID compatível com cuid() do Prisma.
 * Usa crypto.randomBytes para gerar um ID único.
 */
function generateId() {
  return 'c' + crypto.randomBytes(12).toString('hex').slice(0, 24);
}

// Stores em memória para desenvolvimento sem PostgreSQL.
const guildConfigStore = new Map();
const mockTokenStore = new Map();

let pool = null;

if (!isMockDb) {
  // Reutiliza a mesma connection string do site principal.
  // Remove sslmode from URL and configure SSL separately to avoid pg warnings
  let connectionString = process.env.DATABASE_URL || '';
  connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');
  
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 5,
  });

  pool.on('error', (err) => {
    console.error('Erro inesperado no pool PostgreSQL (bot):', err);
  });
  
  // Test connection on startup
  pool.query('SELECT 1').then(() => {
    console.log('[database] Conexão com PostgreSQL estabelecida com sucesso.');
  }).catch((err) => {
    console.error('[database] FALHA ao conectar no PostgreSQL:', err.message);
  });
} else {
  console.log('[database] MOCK_DB=true ativo no bot. Usando Map em memória.');
}

/**
 * Wrapper para execução de query SQL parametrizada.
 * @param {string} text
 * @param {Array<any>} params
 */
async function query(text, params = []) {
  if (isMockDb) {
    // Mantém assinatura compatível com pg para chamadas futuras.
    return Promise.resolve({
      command: 'MOCK',
      rowCount: 0,
      rows: [],
      text,
      params,
    });
  }

  return pool.query(text, params);
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

  const result = await query(
    `
      SELECT guild_id, verified_role_id, log_channel_id, verify_channel_id, webhook_url, created_at, updated_at
      FROM guild_config
      WHERE guild_id = $1
      LIMIT 1
    `,
    [guildId]
  );

  return result.rows[0] || null;
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

  const id = generateId();
  const result = await query(
    `
      INSERT INTO guild_config (
        id,
        guild_id,
        verified_role_id,
        verify_channel_id,
        log_channel_id,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (guild_id)
      DO UPDATE SET
        verified_role_id = EXCLUDED.verified_role_id,
        verify_channel_id = EXCLUDED.verify_channel_id,
        log_channel_id = EXCLUDED.log_channel_id,
        updated_at = NOW()
      RETURNING guild_id, verified_role_id, verify_channel_id, log_channel_id, updated_at
    `,
    [
      id,
      guildId,
      config.verified_role_id,
      config.verify_channel_id,
      config.log_channel_id,
    ]
  );

  return result.rows[0];
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
  const id = generateId();

  const result = await query(
    `
      INSERT INTO verification_tokens (
        id,
        token,
        guild_id,
        user_id,
        discord_user_id,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, token, guild_id, user_id, discord_user_id, expires_at, used_at, created_at
    `,
    [id, token, guildId, userId, userId, expiry]
  );

  return result.rows[0];
}

/**
 * Recupera dados necessários para atribuição de cargo a partir do token.
 * @param {string} token
 */
async function getPendingAssignment(token) {
  if (isMockDb) {
    const tokenRow = mockTokenStore.get(token);

    // Caminho padrão: token criado pelo próprio bot no ambiente mock.
    if (tokenRow) {
      const guildConfig = guildConfigStore.get(tokenRow.guild_id);

      if (!guildConfig?.verified_role_id) {
        return Promise.resolve(null);
      }

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

    // Fallback de desenvolvimento: o site em MOCK_DB aceita qualquer token válido por formato.
    // Nesse cenário, usamos a configuração existente da guild para permitir testar adição real de cargo.
    if (guildConfigStore.size === 1) {
      const [[guildId, guildConfig]] = Array.from(guildConfigStore.entries());

      if (!guildConfig?.verified_role_id) {
        return Promise.resolve(null);
      }

      console.warn('[database][MOCK_DB] Token não encontrado no mockTokenStore. Aplicando fallback com guild configurada.');

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

    if (guildConfigStore.size > 1) {
      console.warn('[database][MOCK_DB] Token não encontrado e há múltiplas guilds no mock. Fallback desativado para evitar atribuição ambígua.');
    }

    return Promise.resolve(null);
  }

  const result = await query(
    `
      SELECT
        vt.token,
        vt.guild_id AS token_guild_id,
        gc.verified_role_id,
        gc.log_channel_id,
        pra.id AS pending_id,
        pra.discord_id AS pending_discord_id,
        pra.guild_id AS pending_guild_id,
        pra.role_id AS pending_role_id,
        pra.processed
      FROM verification_tokens vt
      LEFT JOIN guild_config gc
        ON gc.guild_id = vt.guild_id
      LEFT JOIN LATERAL (
        SELECT id, discord_id, guild_id, role_id, processed
        FROM pending_role_assignments
        WHERE token = vt.token
        ORDER BY created_at DESC
        LIMIT 1
      ) pra ON true
      WHERE vt.token = $1
      LIMIT 1
    `,
    [token]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    token: row.token,
    guild_id: row.pending_guild_id || row.token_guild_id,
    role_id: row.pending_role_id || row.verified_role_id,
    log_channel_id: row.log_channel_id || null,
    pending_id: row.pending_id || null,
    pending_discord_id: row.pending_discord_id || null,
    processed: row.processed ?? null,
  };
}

module.exports = {
  pool,
  query,
  getGuildConfig,
  saveGuildConfig,
  createToken,
  getPendingAssignment,
};
