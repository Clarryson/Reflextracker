'use strict';

const { isValidKenyanPhone, isNonEmptyString, isValidEmail } = require('../../src/utils/validate');

describe('Validators', () => {
  describe('isValidKenyanPhone', () => {
    const valid = [
      '0712345678',
      '0123456789',
      '+254712345678',
      '+254123456789',
      '254712345678',
      '0798765432',
    ];
    const invalid = [
      '071234567',    // too short
      '07123456789',  // too long
      '1234567890',   // doesn't start with 0 or +254
      '',
      null,
      undefined,
      '0612345678',   // 06xx — not a valid Kenyan prefix
      'not-a-number',
    ];

    valid.forEach((phone) => {
      it(`accepts ${phone}`, () => {
        expect(isValidKenyanPhone(phone)).toBe(true);
      });
    });

    invalid.forEach((phone) => {
      it(`rejects ${JSON.stringify(phone)}`, () => {
        expect(isValidKenyanPhone(phone)).toBe(false);
      });
    });
  });

  describe('isNonEmptyString', () => {
    it('returns true for a non-empty string', () => {
      expect(isNonEmptyString('hello')).toBe(true);
    });
    it('returns false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });
    it('returns false for whitespace-only string', () => {
      expect(isNonEmptyString('   ')).toBe(false);
    });
    it('returns false for null', () => {
      expect(isNonEmptyString(null)).toBe(false);
    });
    it('returns false for number', () => {
      expect(isNonEmptyString(42)).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('accepts a valid email', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });
    it('accepts sub-domain email', () => {
      expect(isValidEmail('rider@reflex.co.ke')).toBe(true);
    });
    it('rejects missing @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });
    it('rejects empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });
  });
});
