const crypto = require('crypto');

/**
 * Gera um token aleatório seguro para fluxo de verificação.
 * @returns {string}
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateToken,
};
