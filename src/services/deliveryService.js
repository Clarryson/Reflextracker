'use strict';

/**
 * Reflex — Delivery Service (State Machine)
 *
 * All delivery state transitions live here.
 * Controllers call these methods; they never manipulate delivery rows directly.
 *
 * Valid transitions:
 *   OPEN       → ASSIGNED   (dispatcher assigns a rider)
 *   ASSIGNED   → ASSIGNED   (dispatcher reassigns to different rider)
 *   ASSIGNED   → PICKED_UP  (rider confirms pickup)
 *   PICKED_UP  → DELIVERED  (rider completes after QR verify + proof)
 *
 * Terminal states: DELIVERED, CANCELLED, FAILED — no further transitions allowed.
 */

const { query } = require('../config/db');
const { appendHistory } = require('../models/deliveryHistory');
const { emitDeliveryEvent, EVENTS } = require('../realtime/deliveryEvents');
const { createError } = require('../middleware/errorHandler');

// States that cannot be transitioned out of
const TERMINAL_STATES = ['DELIVERED', 'CANCELLED', 'FAILED'];

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Fetch a delivery by ID. Throws 404 if not found.
 * @param {number} deliveryId
 * @returns {Promise<object>}
 */
async function getDeliveryOrThrow(deliveryId) {
  const [rows] = await query(
    'SELECT * FROM deliveries WHERE id = ?',
    [deliveryId]
  );
  if (rows.length === 0) {
    throw createError('Delivery not found.', 404);
  }
  return rows[0];
}

/**
 * Fetch a user by ID with a specific role. Throws if not found or wrong role.
 * @param {number} userId
 * @param {string} expectedRole
 * @returns {Promise<object>}
 */
async function getUserWithRole(userId, expectedRole) {
  const [rows] = await query(
    'SELECT id, name, email, role FROM users WHERE id = ?',
    [userId]
  );
  if (rows.length === 0) {
    throw createError(`User with ID ${userId} not found.`, 404);
  }
  if (rows[0].role !== expectedRole) {
    throw createError(`User ${userId} does not have the ${expectedRole} role.`, 400);
  }
  return rows[0];
}

// ─── Assign ───────────────────────────────────────────────────────────────────

/**
 * Dispatcher assigns a rider to an OPEN delivery.
 * Transition: OPEN → ASSIGNED
 *
 * @param {number} deliveryId
 * @param {number} riderId
 * @param {number} dispatcherId
 * @returns {Promise<object>} Updated delivery
 */
async function assignRider(deliveryId, riderId, dispatcherId) {
  const delivery = await getDeliveryOrThrow(deliveryId);

  if (TERMINAL_STATES.includes(delivery.status)) {
    throw createError(`Cannot assign a rider to a ${delivery.status} delivery.`, 409);
  }
  if (delivery.status !== 'OPEN') {
    throw createError(
      `Delivery is in ${delivery.status} state. Use reassign to change the rider.`,
      409
    );
  }

  const rider = await getUserWithRole(riderId, 'RIDER');

  await query(
    'UPDATE deliveries SET rider_id = ?, status = ? WHERE id = ?',
    [riderId, 'ASSIGNED', deliveryId]
  );

  await appendHistory({
    deliveryId,
    changedBy: dispatcherId,
    previousStatus: delivery.status,
    newStatus: 'ASSIGNED',
    notes: `Assigned to rider: ${rider.name} (ID: ${riderId})`,
  });

  emitDeliveryEvent(EVENTS.ASSIGNED, deliveryId, {
    riderId,
    riderName: rider.name,
    dispatcherId,
  });

  return getDeliveryOrThrow(deliveryId);
}

// ─── Reassign ─────────────────────────────────────────────────────────────────

/**
 * Dispatcher changes the assigned rider.
 * Only allowed when status is OPEN or ASSIGNED (not after pickup or terminal).
 *
 * @param {number} deliveryId
 * @param {number} newRiderId
 * @param {number} dispatcherId
 * @param {string} [reason]
 * @returns {Promise<object>} Updated delivery
 */
async function reassignRider(deliveryId, newRiderId, dispatcherId, reason = null) {
  const delivery = await getDeliveryOrThrow(deliveryId);

  if (TERMINAL_STATES.includes(delivery.status)) {
    throw createError(`Cannot reassign a ${delivery.status} delivery.`, 409);
  }
  if (!['OPEN', 'ASSIGNED'].includes(delivery.status)) {
    throw createError(
      `Cannot reassign after the rider has confirmed pickup (status: ${delivery.status}).`,
      409
    );
  }

  const previousRiderId = delivery.rider_id;
  const newRider = await getUserWithRole(newRiderId, 'RIDER');

  if (previousRiderId === newRiderId) {
    throw createError('New rider is the same as the current rider.', 400);
  }

  await query(
    'UPDATE deliveries SET rider_id = ?, status = ? WHERE id = ?',
    [newRiderId, 'ASSIGNED', deliveryId]
  );

  const notes = [
    `Reassigned from rider ID ${previousRiderId ?? 'none'} to ${newRider.name} (ID: ${newRiderId})`,
    reason ? `Reason: ${reason}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  await appendHistory({
    deliveryId,
    changedBy: dispatcherId,
    previousStatus: delivery.status,
    newStatus: 'ASSIGNED',
    notes,
  });

  emitDeliveryEvent(EVENTS.REASSIGNED, deliveryId, {
    previousRiderId,
    newRiderId,
    newRiderName: newRider.name,
    dispatcherId,
    reason,
  });

  return getDeliveryOrThrow(deliveryId);
}

// ─── Pickup ───────────────────────────────────────────────────────────────────

/**
 * Rider confirms they have picked up the delivery.
 * Transition: ASSIGNED → PICKED_UP
 *
 * @param {number} deliveryId
 * @param {number} riderId    - Must be the assigned rider
 * @returns {Promise<object>} Updated delivery
 */
async function confirmPickup(deliveryId, riderId) {
  const delivery = await getDeliveryOrThrow(deliveryId);

  if (delivery.status !== 'ASSIGNED') {
    throw createError(
      `Cannot confirm pickup for a delivery in ${delivery.status} state.`,
      409
    );
  }
  if (delivery.rider_id !== riderId) {
    throw createError('You are not assigned to this delivery.', 403);
  }

  const now = new Date();
  await query(
    'UPDATE deliveries SET status = ?, picked_up_at = ? WHERE id = ?',
    ['PICKED_UP', now, deliveryId]
  );

  await appendHistory({
    deliveryId,
    changedBy: riderId,
    previousStatus: 'ASSIGNED',
    newStatus: 'PICKED_UP',
    notes: 'Rider confirmed pickup.',
  });

  emitDeliveryEvent(EVENTS.PICKED_UP, deliveryId, { riderId, pickedUpAt: now });

  return getDeliveryOrThrow(deliveryId);
}

// ─── QR Verify ────────────────────────────────────────────────────────────────

/**
 * Rider verifies the delivery by scanning its QR token.
 * Does NOT change the delivery status — sets qr_verified = true.
 *
 * @param {number} deliveryId
 * @param {number} riderId    - Must be the assigned rider
 * @param {string} qrToken   - Token scanned from the QR code
 * @returns {Promise<object>} Delivery row
 */
async function verifyQR(deliveryId, riderId, qrToken) {
  const delivery = await getDeliveryOrThrow(deliveryId);

  if (delivery.status !== 'PICKED_UP') {
    throw createError(
      `QR verification requires the delivery to be in PICKED_UP state (current: ${delivery.status}).`,
      409
    );
  }
  if (delivery.rider_id !== riderId) {
    throw createError('You are not assigned to this delivery.', 403);
  }
  if (delivery.qr_verified) {
    throw createError('QR code has already been verified for this delivery.', 409);
  }
  if (delivery.qr_token !== qrToken) {
    throw createError('Invalid QR token. Verification failed.', 400);
  }

  await query(
    'UPDATE deliveries SET qr_verified = 1 WHERE id = ?',
    [deliveryId]
  );

  await appendHistory({
    deliveryId,
    changedBy: riderId,
    previousStatus: 'PICKED_UP',
    newStatus: 'PICKED_UP',
    notes: 'QR code verified successfully.',
  });

  emitDeliveryEvent(EVENTS.VERIFIED, deliveryId, {
    riderId,
    deliveryReference: delivery.delivery_reference,
  });

  return getDeliveryOrThrow(deliveryId);
}

// ─── Complete ─────────────────────────────────────────────────────────────────

/**
 * Rider completes a delivery.
 * Transition: PICKED_UP → DELIVERED
 * Prerequisites: QR verified AND proof of delivery exists.
 *
 * @param {number} deliveryId
 * @param {number} riderId    - Must be the assigned rider
 * @returns {Promise<object>} Updated delivery
 */
async function completeDelivery(deliveryId, riderId) {
  const delivery = await getDeliveryOrThrow(deliveryId);

  if (delivery.status !== 'PICKED_UP') {
    throw createError(
      `Cannot complete a delivery in ${delivery.status} state. Status must be PICKED_UP.`,
      409
    );
  }
  if (delivery.rider_id !== riderId) {
    throw createError('You are not assigned to this delivery.', 403);
  }
  if (!delivery.qr_verified) {
    throw createError('QR code must be verified before completing the delivery.', 409);
  }

  // Check proof of delivery exists
  const [proofRows] = await query(
    'SELECT id FROM proof_of_delivery WHERE delivery_id = ?',
    [deliveryId]
  );
  if (proofRows.length === 0) {
    throw createError('Proof of delivery must be uploaded before completing the delivery.', 409);
  }

  const now = new Date();
  await query(
    'UPDATE deliveries SET status = ?, delivered_at = ? WHERE id = ?',
    ['DELIVERED', now, deliveryId]
  );

  await appendHistory({
    deliveryId,
    changedBy: riderId,
    previousStatus: 'PICKED_UP',
    newStatus: 'DELIVERED',
    notes: 'Delivery completed successfully.',
  });

  emitDeliveryEvent(EVENTS.DELIVERED, deliveryId, {
    riderId,
    deliveredAt: now,
    deliveryReference: delivery.delivery_reference,
  });

  return getDeliveryOrThrow(deliveryId);
}

module.exports = {
  assignRider,
  reassignRider,
  confirmPickup,
  verifyQR,
  completeDelivery,
  getDeliveryOrThrow, // exported for use in controllers
};
