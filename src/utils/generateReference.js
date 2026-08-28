'use strict';

const { query } = require('../config/db');

/**
 * Generates the next delivery reference in the format DEL-000001.
 *
 * Queries the database for the highest existing reference number and
 * increments it. This approach is simple and correct for an MVP with
 * moderate concurrency. For high-throughput production use, a dedicated
 * sequence table with SELECT ... FOR UPDATE or a UUID-based reference
 * should be considered.
 *
 * @returns {Promise<string>} e.g. "DEL-000042"
 */
async function generateDeliveryReference() {
  const [rows] = await query(
    `SELECT delivery_reference
     FROM deliveries
     ORDER BY id DESC
     LIMIT 1`
  );

  let nextNum = 1;
  if (rows.length > 0) {
    const lastRef = rows[0].delivery_reference; // e.g. "DEL-000042"
    const numPart = parseInt(lastRef.replace('DEL-', ''), 10);
    nextNum = numPart + 1;
  }

  return `DEL-${String(nextNum).padStart(6, '0')}`;
}

module.exports = { generateDeliveryReference };
