'use strict';

const { getIo } = require('./socket');

/**
 * Delivery event names — centralised so they cannot drift between emitter and consumer.
 */
const EVENTS = {
  CREATED: 'delivery:created',
  ASSIGNED: 'delivery:assigned',
  REASSIGNED: 'delivery:reassigned',
  PICKED_UP: 'delivery:picked_up',
  VERIFIED: 'delivery:verified',
  PROOF_UPLOADED: 'delivery:proof_uploaded',
  DELIVERED: 'delivery:delivered',
  INCIDENT: 'delivery:incident',
};

/**
 * Emit a delivery event to all clients subscribed to the delivery's room.
 *
 * Business logic should not call io.emit() directly.
 * All real-time emissions go through this function.
 *
 * @param {string} eventName     - One of EVENTS values
 * @param {number} deliveryId    - The delivery ID
 * @param {object} payload       - Additional data to send
 */
function emitDeliveryEvent(eventName, deliveryId, payload = {}) {
  try {
    const io = getIo();
    const room = `delivery:${deliveryId}`;
    io.to(room).emit('delivery:updated', {
      event: eventName,
      deliveryId,
      timestamp: new Date().toISOString(),
      ...payload,
    });
    // Also emit the named event for clients that want fine-grained subscriptions
    io.to(room).emit(eventName, {
      deliveryId,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  } catch (err) {
    // Socket.IO not initialised (e.g., during unit tests) — safe to ignore
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Socket.IO] Could not emit event:', err.message);
    }
  }
}

module.exports = { emitDeliveryEvent, EVENTS };
