'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const ctrl = require('../controllers/deliveryController');
const { reportIncident, listIncidents } = require('../controllers/incidentController');

const router = Router();

// All delivery routes require authentication
router.use(authenticate);

// ── CRUD ──────────────────────────────────────────────────────────────────────

// POST /api/deliveries — retailer creates a delivery
router.post('/', authorize('RETAILER'), ctrl.createDelivery);

// GET /api/deliveries — list (role-scoped)
router.get('/', ctrl.listDeliveries);

// GET /api/deliveries/:id — full detail
router.get('/:id', ctrl.getDelivery);

// ── Dispatcher operations ─────────────────────────────────────────────────────

// PATCH /api/deliveries/:id/assign
router.patch('/:id/assign', authorize('DISPATCHER'), ctrl.assignRider);

// PATCH /api/deliveries/:id/reassign
router.patch('/:id/reassign', authorize('DISPATCHER'), ctrl.reassignRider);

// ── Rider operations ──────────────────────────────────────────────────────────

// POST /api/deliveries/:id/pickup
router.post('/:id/pickup', authorize('RIDER'), ctrl.confirmPickup);

// POST /api/deliveries/:id/verify
router.post('/:id/verify', authorize('RIDER'), ctrl.verifyQR);

// POST /api/deliveries/:id/proof  (multipart)
router.post(
  '/:id/proof',
  authorize('RIDER'),
  upload.single('proof'),
  handleUploadError,
  ctrl.uploadProof
);

// POST /api/deliveries/:id/complete
router.post('/:id/complete', authorize('RIDER'), ctrl.completeDelivery);

// ── History ────────────────────────────────────────────────────────────────────

// GET /api/deliveries/:id/history
router.get('/:id/history', ctrl.getDeliveryHistory);

// ── Incidents ─────────────────────────────────────────────────────────────────

// POST /api/deliveries/:id/incidents
router.post('/:id/incidents', authorize('RIDER', 'DISPATCHER'), reportIncident);

// GET /api/deliveries/:id/incidents
router.get('/:id/incidents', listIncidents);

module.exports = router;
