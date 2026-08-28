'use strict';

const { Router } = require('express');
const { register, login, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me  (protected)
router.get('/me', authenticate, me);

module.exports = router;
