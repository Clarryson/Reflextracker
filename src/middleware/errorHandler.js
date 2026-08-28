'use strict';

const { sendError } = require('../utils/response');

/**
 * Global error handler middleware.
 * Must be registered last in Express middleware chain.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Log the error for server-side visibility
  console.error('[ErrorHandler]', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Known operational errors surfaced by services
  if (err.isOperational) {
    return sendError(res, err.message, err.statusCode || 400);
  }

  // Fallback for unexpected errors
  return sendError(res, 'An unexpected error occurred. Please try again later.', 500);
}

/**
 * Creates an operational (user-facing) error.
 * @param {string} message
 * @param {number} [statusCode=400]
 * @returns {Error}
 */
function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.isOperational = true;
  err.statusCode = statusCode;
  return err;
}

module.exports = { errorHandler, createError };
