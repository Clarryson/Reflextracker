'use strict';

const { query } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * GET /api/riders
 * Returns all users with role RIDER.
 * Authenticated: DISPATCHER only
 */
async function listRiders(req, res, next) {
  try {
    const [rows] = await query(
      `SELECT id, name, email, phone, created_at AS createdAt
       FROM users
       WHERE role = 'RIDER'
       ORDER BY name ASC`
    );
    return sendSuccess(res, { riders: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/riders/:id
 * Returns a single rider's profile.
 * Authenticated: DISPATCHER only
 */
async function getRider(req, res, next) {
  try {
    const riderId = parseInt(req.params.id, 10);
    if (isNaN(riderId)) {
      return sendError(res, 'Invalid rider ID.', 400);
    }

    const [rows] = await query(
      `SELECT id, name, email, phone, created_at AS createdAt
       FROM users
       WHERE id = ? AND role = 'RIDER'`,
      [riderId]
    );

    if (rows.length === 0) {
      return sendError(res, 'Rider not found.', 404);
    }

    // Active deliveries for this rider
    const [deliveries] = await query(
      `SELECT id, delivery_reference AS reference, status, customer_name AS customerName,
              delivery_address AS deliveryAddress
       FROM deliveries
       WHERE rider_id = ? AND status NOT IN ('DELIVERED','CANCELLED','FAILED')
       ORDER BY created_at DESC`,
      [riderId]
    );

    return sendSuccess(res, {
      rider: rows[0],
      activeDeliveries: deliveries,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRiders, getRider };
