require('dotenv').config();

/**
 * Valida variáveis obrigatórias do BOT.
 * Retorna true quando está tudo certo e false quando há pendências.
 */
function validateBotEnv() {
  const requiredVars = [
    {
      name: 'DATABASE_URL',
      description: 'conexão com o banco PostgreSQL compartilhada com o site',
    },
    {
      name: 'INTERNAL_API_SECRET',
      description: 'segredo interno usado para autenticar chamadas vindas do site',
    },
    {
      name: 'BOT_TOKEN',
      description: 'token do bot Discord para login',
    },
    {
      name: 'BOT_PORT',
      description: 'porta do servidor HTTP interno do bot',
    },
    {
      name: 'SITE_URL',
      description: 'URL do site usada nos links de verificação enviados por DM',
    },
  ];

  const missingVars = requiredVars.filter(({ name }) => {
    const value = process.env[name];
    return !value || !String(value).trim();
  });

  if (missingVars.length > 0) {
    console.error('\n❌ Configuração de ambiente incompleta para o BOT.');
    console.error('Preencha as variáveis abaixo no arquivo bot/.env:\n');

    for (const variable of missingVars) {
      console.error(`- ${variable.name}: ${variable.description}`);
    }

    console.error('\n💡 Dica: copie o template com "cp bot/.env.example bot/.env" e ajuste os valores.\n');
    return false;
  }

  console.log('✅ Ambiente do BOT validado com sucesso.');
  return true;
}

module.exports = {
  validateBotEnv,
};

if (require.main === module) {
  const isValid = validateBotEnv();
  if (!isValid) {
    process.exit(1);
  }
}
