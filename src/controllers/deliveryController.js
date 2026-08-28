'use strict';

const { query } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const { isValidKenyanPhone, isNonEmptyString } = require('../utils/validate');
const { generateDeliveryReference } = require('../utils/generateReference');
const { generateQrToken } = require('../utils/generateToken');
const { appendHistory, getHistory } = require('../models/deliveryHistory');
const { emitDeliveryEvent, EVENTS } = require('../realtime/deliveryEvents');
const deliveryService = require('../services/deliveryService');
const { createError } = require('../middleware/errorHandler');
const path = require('path');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the full delivery detail object (with history, proof, incidents).
 */
async function buildDeliveryDetail(deliveryId) {
  // Main delivery
  const [deliveryRows] = await query(
    `SELECT
       d.id, d.delivery_reference AS reference, d.status,
       d.customer_name AS customerName, d.customer_phone AS customerPhone,
       d.delivery_address AS deliveryAddress, d.item_description AS itemDescription,
       d.qr_verified AS qrVerified,
       d.created_at AS createdAt, d.updated_at AS updatedAt,
       d.picked_up_at AS pickedUpAt, d.delivered_at AS deliveredAt,
       r.id AS retailerId, r.name AS retailerName, r.email AS retailerEmail,
       ri.id AS riderId, ri.name AS riderName, ri.phone AS riderPhone
     FROM deliveries d
     JOIN users r  ON r.id  = d.retailer_id
     LEFT JOIN users ri ON ri.id = d.rider_id
     WHERE d.id = ?`,
    [deliveryId]
  );
  if (deliveryRows.length === 0) return null;

  const delivery = deliveryRows[0];

  // History
  const history = await getHistory(deliveryId);

  // Proof of delivery
  const [proofRows] = await query(
    'SELECT id, file_url AS fileUrl, file_type AS fileType, uploaded_at AS uploadedAt FROM proof_of_delivery WHERE delivery_id = ?',
    [deliveryId]
  );

  // Incidents
  const [incidentRows] = await query(
    `SELECT i.id, i.incident_type AS incidentType, i.description, i.status,
            i.created_at AS createdAt, i.resolved_at AS resolvedAt,
            u.name AS reportedByName
     FROM incidents i
     JOIN users u ON u.id = i.reported_by
     WHERE i.delivery_id = ?
     ORDER BY i.created_at ASC`,
    [deliveryId]
  );

  return {
    ...delivery,
    history,
    proof: proofRows[0] || null,
    incidents: incidentRows,
  };
}

// ─── Create Delivery ──────────────────────────────────────────────────────────

/**
 * POST /api/deliveries
 * Authenticated: RETAILER only
 */
async function createDelivery(req, res, next) {
  try {
    const { customerName, customerPhone, deliveryAddress, itemDescription } = req.body;

    if (!isNonEmptyString(customerName)) {
      return sendError(res, 'Customer name is required.', 400);
    }
    if (!isValidKenyanPhone(customerPhone)) {
      return sendError(
        res,
        'A valid Kenyan customer phone number is required (e.g., 0712345678).',
        400
      );
    }
    if (!isNonEmptyString(deliveryAddress)) {
      return sendError(res, 'Delivery address is required.', 400);
    }
    if (!isNonEmptyString(itemDescription)) {
      return sendError(res, 'Item description is required.', 400);
    }

    const reference = await generateDeliveryReference();
    const qrToken = generateQrToken(reference);

    const [result] = await query(
      `INSERT INTO deliveries
         (delivery_reference, retailer_id, customer_name, customer_phone,
          delivery_address, item_description, status, qr_token)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [
        reference,
        req.user.id,
        customerName.trim(),
        customerPhone,
        deliveryAddress.trim(),
        itemDescription.trim(),
        qrToken,
      ]
    );

    const deliveryId = result.insertId;

    await appendHistory({
      deliveryId,
      changedBy: req.user.id,
      previousStatus: null,
      newStatus: 'OPEN',
      notes: 'Delivery created.',
    });

    emitDeliveryEvent(EVENTS.CREATED, deliveryId, {
      reference,
      retailerId: req.user.id,
    });

    return sendSuccess(
      res,
      {
        delivery: {
          id: deliveryId,
          reference,
          status: 'OPEN',
          qrToken, // returned so the frontend can generate the QR image
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

// ─── List Deliveries ──────────────────────────────────────────────────────────

/**
 * GET /api/deliveries
 * Query params: status, riderId, retailerId
 * Results are scoped by the caller's role.
 */
async function listDeliveries(req, res, next) {
  try {
    const { status, riderId, retailerId } = req.query;
    const { id: userId, role } = req.user;

    const conditions = [];
    const params = [];

    // Role-based scoping
    if (role === 'RETAILER') {
      conditions.push('d.retailer_id = ?');
      params.push(userId);
    } else if (role === 'RIDER') {
      conditions.push('d.rider_id = ?');
      params.push(userId);
    }
    // DISPATCHER sees all deliveries but can still filter

    // Optional filters
    if (status) {
      const validStatuses = ['OPEN', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'FAILED', 'INCIDENT'];
      if (!validStatuses.includes(status.toUpperCase())) {
        return sendError(res, `Invalid status filter. Must be one of: ${validStatuses.join(', ')}.`, 400);
      }
      conditions.push('d.status = ?');
      params.push(status.toUpperCase());
    }
    if (riderId && role === 'DISPATCHER') {
      conditions.push('d.rider_id = ?');
      params.push(parseInt(riderId, 10));
    }
    if (retailerId && role === 'DISPATCHER') {
      conditions.push('d.retailer_id = ?');
      params.push(parseInt(retailerId, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await query(
      `SELECT
         d.id, d.delivery_reference AS reference, d.status,
         d.customer_name AS customerName, d.customer_phone AS customerPhone,
         d.delivery_address AS deliveryAddress, d.item_description AS itemDescription,
         d.created_at AS createdAt, d.updated_at AS updatedAt,
         d.picked_up_at AS pickedUpAt, d.delivered_at AS deliveredAt,
         r.name AS retailerName,
         ri.name AS riderName
       FROM deliveries d
       JOIN users r ON r.id = d.retailer_id
       LEFT JOIN users ri ON ri.id = d.rider_id
       ${whereClause}
       ORDER BY d.created_at DESC`,
      params
    );

    return sendSuccess(res, { deliveries: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
}

// ─── Get Delivery ─────────────────────────────────────────────────────────────

/**
 * GET /api/deliveries/:id
 */
async function getDelivery(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    const detail = await buildDeliveryDetail(deliveryId);
    if (!detail) {
      return sendError(res, 'Delivery not found.', 404);
    }

    // Enforce role-based visibility
    const { id: userId, role } = req.user;
    if (role === 'RETAILER' && detail.retailerId !== userId) {
      return sendError(res, 'Access denied.', 403);
    }
    if (role === 'RIDER' && detail.riderId !== userId) {
      return sendError(res, 'Access denied.', 403);
    }

    // Don't expose the raw QR token to anyone except the retailer who owns it
    if (role !== 'RETAILER' || detail.retailerId !== userId) {
      delete detail.qrToken;
    }

    return sendSuccess(res, { delivery: detail });
  } catch (err) {
    next(err);
  }
}

// ─── Assign Rider ─────────────────────────────────────────────────────────────

/**
 * PATCH /api/deliveries/:id/assign
 * Body: { riderId }
 * Authenticated: DISPATCHER only
 */
async function assignRider(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    const riderId = parseInt(req.body.riderId, 10);

    if (isNaN(deliveryId) || isNaN(riderId)) {
      return sendError(res, 'Valid delivery ID and rider ID are required.', 400);
    }

    const updated = await deliveryService.assignRider(deliveryId, riderId, req.user.id);
    return sendSuccess(res, { delivery: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Reassign Rider ───────────────────────────────────────────────────────────

/**
 * PATCH /api/deliveries/:id/reassign
 * Body: { riderId, reason? }
 * Authenticated: DISPATCHER only
 */
async function reassignRider(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    const riderId = parseInt(req.body.riderId, 10);
    const reason = req.body.reason || null;

    if (isNaN(deliveryId) || isNaN(riderId)) {
      return sendError(res, 'Valid delivery ID and rider ID are required.', 400);
    }

    const updated = await deliveryService.reassignRider(
      deliveryId,
      riderId,
      req.user.id,
      reason
    );
    return sendSuccess(res, { delivery: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Confirm Pickup ───────────────────────────────────────────────────────────

/**
 * POST /api/deliveries/:id/pickup
 * Authenticated: RIDER only
 */
async function confirmPickup(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    const updated = await deliveryService.confirmPickup(deliveryId, req.user.id);
    return sendSuccess(res, { delivery: updated });
  } catch (err) {
    next(err);
  }
}

// ─── QR Verify ────────────────────────────────────────────────────────────────

/**
 * POST /api/deliveries/:id/verify
 * Body: { qrToken }
 * Authenticated: RIDER only
 */
async function verifyQR(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    const { qrToken } = req.body;

    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }
    if (!isNonEmptyString(qrToken)) {
      return sendError(res, 'QR token is required.', 400);
    }

    const delivery = await deliveryService.verifyQR(deliveryId, req.user.id, qrToken);
    return sendSuccess(res, {
      verified: true,
      deliveryReference: delivery.delivery_reference,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Upload Proof of Delivery ────────────────────────────────────────────────

/**
 * POST /api/deliveries/:id/proof
 * Multipart/form-data with field name "proof"
 * Authenticated: RIDER only
 */
async function uploadProof(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    if (!req.file) {
      return sendError(res, 'No file uploaded. Please attach a proof file.', 400);
    }

    // Verify the delivery exists and belongs to this rider
    const delivery = await deliveryService.getDeliveryOrThrow(deliveryId);

    if (!['PICKED_UP'].includes(delivery.status)) {
      return sendError(
        res,
        `Proof can only be uploaded for deliveries in PICKED_UP state (current: ${delivery.status}).`,
        409
      );
    }
    if (delivery.rider_id !== req.user.id) {
      return sendError(res, 'You are not assigned to this delivery.', 403);
    }

    // Remove any old proof (idempotent re-upload is allowed before completion)
    await query('DELETE FROM proof_of_delivery WHERE delivery_id = ?', [deliveryId]);

    const fileUrl = `${process.env.UPLOAD_DIR || 'uploads/proof'}/${req.file.filename}`;

    await query(
      'INSERT INTO proof_of_delivery (delivery_id, rider_id, file_url, file_type) VALUES (?, ?, ?, ?)',
      [deliveryId, req.user.id, fileUrl, req.file.mimetype]
    );

    emitDeliveryEvent(EVENTS.PROOF_UPLOADED, deliveryId, { riderId: req.user.id });

    return sendSuccess(
      res,
      {
        proof: {
          deliveryId,
          fileUrl,
          fileType: req.file.mimetype,
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

// ─── Complete Delivery ────────────────────────────────────────────────────────

/**
 * POST /api/deliveries/:id/complete
 * Authenticated: RIDER only
 */
async function completeDelivery(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    const updated = await deliveryService.completeDelivery(deliveryId, req.user.id);
    return sendSuccess(res, { delivery: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Delivery History ─────────────────────────────────────────────────────────

/**
 * GET /api/deliveries/:id/history
 */
async function getDeliveryHistory(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    if (isNaN(deliveryId)) {
      return sendError(res, 'Invalid delivery ID.', 400);
    }

    // Verify delivery exists
    await deliveryService.getDeliveryOrThrow(deliveryId);

    const history = await getHistory(deliveryId);
    return sendSuccess(res, { history });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createDelivery,
  listDeliveries,
  getDelivery,
  assignRider,
  reassignRider,
  confirmPickup,
  verifyQR,
  uploadProof,
  completeDelivery,
  getDeliveryHistory,
};
