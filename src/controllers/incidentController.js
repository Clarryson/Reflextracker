'use strict';

const { query } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const VALID_INCIDENT_TYPES = [
  'CUSTOMER_UNAVAILABLE',
  'WRONG_ADDRESS',
  'DAMAGED_ITEM',
  'VEHICLE_PROBLEM',
  'OTHER',
];

// ─── Report Incident ──────────────────────────────────────────────────────────

/**
 * POST /api/deliveries/:id/incidents
 * Body: { incidentType, description }
 * Authenticated: RIDER or DISPATCHER
 */
async function reportIncident(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    const { incidentType, description } = req.body;

    if (!VALID_INCIDENT_TYPES.includes(incidentType)) {
      return sendError(
        res,
        `Invalid incident type. Must be one of: ${VALID_INCIDENT_TYPES.join(', ')}.`,
        400
      );
    }
    if (!description || String(description).trim().length === 0) {
      return sendError(res, 'Incident description is required.', 400);
    }

    // Verify delivery exists
    const [deliveryRows] = await query(
      'SELECT id, status, rider_id FROM deliveries WHERE id = ?',
      [deliveryId]
    );
    if (deliveryRows.length === 0) {
      return sendError(res, 'Delivery not found.', 404);
    }

    const delivery = deliveryRows[0];

    // Riders can only report on their own deliveries
    if (req.user.role === 'RIDER' && delivery.rider_id !== req.user.id) {
      return sendError(res, 'You are not assigned to this delivery.', 403);
    }

    // Cannot report on already-delivered deliveries (but can on INCIDENT state)
    if (delivery.status === 'DELIVERED') {
      return sendError(res, 'Cannot report an incident on a completed delivery.', 409);
    }

    const [result] = await query(
      `INSERT INTO incidents (delivery_id, reported_by, incident_type, description)
       VALUES (?, ?, ?, ?)`,
      [deliveryId, req.user.id, incidentType, description.trim()]
    );

    // Optionally flag the delivery with INCIDENT status
    // (only if it isn't already in a terminal state)
    const nonTerminalStatuses = ['OPEN', 'ASSIGNED', 'PICKED_UP'];
    if (nonTerminalStatuses.includes(delivery.status)) {
      await query(
        'UPDATE deliveries SET status = ? WHERE id = ?',
        ['INCIDENT', deliveryId]
      );
    }

    const { emitDeliveryEvent, EVENTS } = require('../realtime/deliveryEvents');
    emitDeliveryEvent(EVENTS.INCIDENT, deliveryId, {
      incidentType,
      reportedBy: req.user.id,
    });

    return sendSuccess(
      res,
      {
        incident: {
          id: result.insertId,
          deliveryId,
          incidentType,
          description: description.trim(),
          reportedBy: req.user.id,
          status: 'OPEN',
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

// ─── List Incidents ───────────────────────────────────────────────────────────

/**
 * GET /api/deliveries/:id/incidents
 */
async function listIncidents(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    // Verify delivery exists
    const [deliveryRows] = await query(
      'SELECT id FROM deliveries WHERE id = ?',
      [deliveryId]
    );
    if (deliveryRows.length === 0) {
      return sendError(res, 'Delivery not found.', 404);
    }

    const [rows] = await query(
      `SELECT
         i.id, i.incident_type AS incidentType, i.description,
         i.status, i.created_at AS createdAt, i.resolved_at AS resolvedAt,
         u.id AS reportedById, u.name AS reportedByName, u.role AS reportedByRole
       FROM incidents i
       JOIN users u ON u.id = i.reported_by
       WHERE i.delivery_id = ?
       ORDER BY i.created_at ASC`,
      [deliveryId]
    );

    return sendSuccess(res, { incidents: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
}

module.exports = { reportIncident, listIncidents };
