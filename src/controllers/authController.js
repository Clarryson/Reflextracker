'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const { isValidEmail, isValidKenyanPhone, isNonEmptyString } = require('../utils/validate');

const SALT_ROUNDS = 10;
const ALLOWED_ROLES = ['RETAILER', 'DISPATCHER', 'RIDER'];
const JWT_SECRET = process.env.JWT_SECRET || 'reflex_delivery_tracker_jwt_secret_dev_key_2026';

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { name, email, phone, password, role }
 */
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role } = req.body;

    // Validation
    if (!isNonEmptyString(name)) {
      return sendError(res, 'Name is required.', 400);
    }
    if (!isValidEmail(email)) {
      return sendError(res, 'A valid email address is required.', 400);
    }
    if (!isValidKenyanPhone(phone)) {
      return sendError(
        res,
        'A valid Kenyan phone number is required (e.g., 0712345678).',
        400
      );
    }
    if (!isNonEmptyString(password) || password.length < 8) {
      return sendError(res, 'Password must be at least 8 characters.', 400);
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return sendError(
        res,
        `Role must be one of: ${ALLOWED_ROLES.join(', ')}.`,
        400
      );
    }

    // Check uniqueness
    const [existing] = await query('SELECT id FROM users WHERE email = ?', [
      email.toLowerCase(),
    ]);
    if (existing.length > 0) {
      return sendError(res, 'An account with this email already exists.', 409);
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase(), phone, password_hash, role]
    );

    const userId = result.insertId;

    return sendSuccess(
      res,
      {
        user: {
          id: userId,
          name: name.trim(),
          email: email.toLowerCase(),
          phone,
          role,
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !isNonEmptyString(password)) {
      return sendError(res, 'Email and password are required.', 400);
    }

    const [rows] = await query(
      'SELECT id, name, email, phone, password_hash, role FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return sendError(res, 'Invalid email or password.', 401);
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return sendError(res, 'Invalid email or password.', 401);
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    return sendSuccess(res, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Me ───────────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile.
 */
async function me(req, res, next) {
  try {
    const [rows] = await query(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return sendError(res, 'User not found.', 404);
    }

    return sendSuccess(res, { user: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
