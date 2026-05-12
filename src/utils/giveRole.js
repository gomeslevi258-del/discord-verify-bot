/**
 * Atribui um cargo para um membro específico dentro da guild.
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {string} roleId
 */
async function giveRole(guild, userId, roleId) {
  if (!guild) {
    throw new Error('Guild não informada para atribuição de cargo.');
  }

  if (!userId || !roleId) {
    throw new Error('Parâmetros obrigatórios ausentes: userId e/ou roleId.');
  }

  const member = await guild.members.fetch(userId);

  if (!member) {
    throw new Error(`Membro ${userId} não encontrado na guild ${guild.id}.`);
  }

  await member.roles.add(roleId);

  return member;
}

module.exports = {
  giveRole,
};
