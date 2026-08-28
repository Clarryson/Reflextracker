'use strict';

/**
 * Consistent JSON response helpers.
 * All controllers must use these instead of calling res.json() directly.
 */

/**
 * Send a successful response.
 * @param {import('express').Response} res
 * @param {object|null} data
 * @param {number} [statusCode=200]
 */
function sendSuccess(res, data = null, statusCode = 200) {
  const body = { success: true };
  if (data !== null) Object.assign(body, { data });
  return res.status(statusCode).json(body);
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 */
function sendError(res, message, statusCode = 500) {
  return res.status(statusCode).json({ success: false, message });
}

module.exports = { sendSuccess, sendError };
