'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { listRiders, getRider } = require('../controllers/riderController');

const router = Router();

router.use(authenticate);
router.use(authorize('DISPATCHER'));

// GET /api/riders
router.get('/', listRiders);

// GET /api/riders/:id
router.get('/:id', getRider);

module.exports = router;
