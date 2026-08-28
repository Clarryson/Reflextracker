'use strict';

const { query } = require('../config/db');

/**
 * Delivery History Model
 *
 * Append-only — records are never updated or deleted.
 */

/**
 * Append a history record for a delivery status change.
 *
 * @param {object} params
 * @param {number} params.deliveryId
 * @param {number} params.changedBy     - User ID who triggered the change
 * @param {string|null} params.previousStatus
 * @param {string} params.newStatus
 * @param {string} [params.notes]
 * @returns {Promise<number>} Inserted row ID
 */
async function appendHistory({ deliveryId, changedBy, previousStatus, newStatus, notes = null }) {
  const [result] = await query(
    `INSERT INTO delivery_history
       (delivery_id, changed_by, previous_status, new_status, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [deliveryId, changedBy, previousStatus ?? null, newStatus, notes]
  );
  return result.insertId;
}

/**
 * Retrieve the full status history for a delivery, oldest first.
 *
 * @param {number} deliveryId
 * @returns {Promise<object[]>}
 */
async function getHistory(deliveryId) {
  const [rows] = await query(
    `SELECT
       dh.id,
       dh.previous_status AS previousStatus,
       dh.new_status      AS newStatus,
       dh.notes,
       dh.created_at      AS timestamp,
       u.id               AS changedById,
       u.name             AS changedByName,
       u.role             AS changedByRole
     FROM delivery_history dh
     JOIN users u ON u.id = dh.changed_by
     WHERE dh.delivery_id = ?
     ORDER BY dh.created_at ASC, dh.id ASC`,
    [deliveryId]
  );
  return rows;
}

module.exports = { appendHistory, getHistory };
