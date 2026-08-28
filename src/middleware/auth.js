'use strict';

const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');

/**
 * Middleware: verifies the JWT and attaches the decoded user to req.user.
 * Expects: Authorization: Bearer <token>
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authentication required. Please log in.', 401);
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, name, email, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Session expired. Please log in again.', 401);
    }
    return sendError(res, 'Invalid authentication token.', 401);
  }
}

/**
 * Middleware factory: checks that the authenticated user has one of the
 * specified roles. Must be used AFTER authenticate().
 *
 * @param {...string} roles - Allowed roles e.g. 'DISPATCHER', 'RIDER'
 * @returns {import('express').RequestHandler}
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', 401);
    }
    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Required role: ${roles.join(' or ')}.`,
        403
      );
    }
    next();
  };
}

module.exports = { authenticate, authorize };
