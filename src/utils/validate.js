'use strict';

/**
 * Input validation helpers.
 */

/**
 * Validates a Kenyan phone number.
 * Accepts formats: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
 * @param {string} phone
 * @returns {boolean}
 */
function isValidKenyanPhone(phone) {
  if (typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\s+/g, '');
  // Local: 07xx or 01xx (10 digits)
  if (/^0[17]\d{8}$/.test(cleaned)) return true;
  // International with +: +2547xx or +2541xx
  if (/^\+254[17]\d{8}$/.test(cleaned)) return true;
  // International without +: 2547xx or 2541xx
  if (/^254[17]\d{8}$/.test(cleaned)) return true;
  return false;
}

/**
 * Checks that a value is a non-empty string.
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates that an email address has a reasonable format.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

module.exports = { isValidKenyanPhone, isNonEmptyString, isValidEmail };
