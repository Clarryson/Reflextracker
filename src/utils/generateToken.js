'use strict';

const crypto = require('crypto');

/**
 * Generates a secure, unguessable QR token for a delivery.
 *
 * Format: REFLEX-{deliveryReference}-{32-char hex random}
 * Example: REFLEX-DEL-000001-a3f7c9e1b4d2f8a0c6e2b1d4f7a9c3e5
 *
 * The token is stored server-side and compared during verification.
 * No sensitive customer data is embedded in the token.
 *
 * @param {string} deliveryReference - e.g. "DEL-000001"
 * @returns {string}
 */
function generateQrToken(deliveryReference) {
  const secret = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  return `REFLEX-${deliveryReference}-${secret}`;
}

module.exports = { generateQrToken };
