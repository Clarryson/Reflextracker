'use strict';

/**
 * Integration tests for the full delivery lifecycle.
 *
 * Covers:
 *  ✓ Happy path: Create → Assign → Pickup → QR Verify → Upload Proof → Complete
 *  ✓ All major invalid-transition cases
 *  ✓ Role-based authorization
 *
 * Requires a running MySQL test database (DB_NAME_TEST).
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();
process.env.JWT_SECRET = 'test-jwt-secret-for-delivery-integration';

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../../src/app');
const { createTables, truncateTables, closePool } = require('../helpers/dbHelper');

beforeAll(async () => {
  await createTables();
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RETAILER = {
  name: 'Kamau Electronics',
  email: 'kamau@electronics.co.ke',
  phone: '0712345678',
  password: 'Password123!',
  role: 'RETAILER',
};

const RETAILER_2 = {
  name: 'Aisha Pharma',
  email: 'aisha@pharma.co.ke',
  phone: '0723456789',
  password: 'Password123!',
  role: 'RETAILER',
};

const DISPATCHER = {
  name: 'Dispatcher Omondi',
  email: 'omondi@reflex.co.ke',
  phone: '0734567890',
  password: 'Password123!',
  role: 'DISPATCHER',
};

const RIDER = {
  name: 'Brian Mutua',
  email: 'brian@rider.co.ke',
  phone: '0745678901',
  password: 'Password123!',
  role: 'RIDER',
};

const RIDER_2 = {
  name: 'Grace Wanjiru',
  email: 'grace@rider.co.ke',
  phone: '0756789012',
  password: 'Password123!',
  role: 'RIDER',
};

const DELIVERY_PAYLOAD = {
  customerName: 'John Kamau',
  customerPhone: '0712345678',
  deliveryAddress: 'Kilimani, Nairobi',
  itemDescription: 'Samsung Galaxy A15',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(userPayload) {
  await request(app).post('/api/auth/register').send(userPayload);
  const res = await request(app).post('/api/auth/login').send({
    email: userPayload.email,
    password: userPayload.password,
  });
  return { token: res.body.data.token, user: res.body.data.user };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Happy Path ───────────────────────────────────────────────────────────────

describe('Full Delivery Lifecycle — Happy Path', () => {
  it('completes the full journey: Create → Assign → Pickup → Verify → Proof → Complete', async () => {
    const { token: retailerToken } = await registerAndLogin(RETAILER);
    const { token: dispatcherToken } = await registerAndLogin(DISPATCHER);
    const { token: riderToken, user: riderUser } = await registerAndLogin(RIDER);

    // 1. Retailer creates delivery
    const createRes = await request(app)
      .post('/api/deliveries')
      .set(authHeader(retailerToken))
      .send(DELIVERY_PAYLOAD);

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.delivery.status).toBe('OPEN');
    const { id: deliveryId, qrToken } = createRes.body.data.delivery;

    // 2. Dispatcher assigns rider
    const assignRes = await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId: riderUser.id });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.delivery.status).toBe('ASSIGNED');

    // 3. Rider confirms pickup
    const pickupRes = await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));

    expect(pickupRes.status).toBe(200);
    expect(pickupRes.body.data.delivery.status).toBe('PICKED_UP');

    // 4. Rider verifies QR code
    const verifyRes = await request(app)
      .post(`/api/deliveries/${deliveryId}/verify`)
      .set(authHeader(riderToken))
      .send({ qrToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.deliveryReference).toMatch(/^DEL-/);

    // 5. Rider uploads proof of delivery (a tiny test PNG)
    const testImagePath = path.join(__dirname, '../helpers/test_proof.png');
    // Create a minimal 1x1 PNG for testing
    if (!fs.existsSync(testImagePath)) {
      const { createCanvas } = (() => {
        try { return require('canvas'); } catch { return null; }
      })() || {};
      // Fallback: write raw minimal PNG bytes
      const minimalPng = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
        '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
        'hex'
      );
      fs.writeFileSync(testImagePath, minimalPng);
    }

    const proofRes = await request(app)
      .post(`/api/deliveries/${deliveryId}/proof`)
      .set(authHeader(riderToken))
      .attach('proof', testImagePath);

    expect(proofRes.status).toBe(201);
    expect(proofRes.body.data.proof.deliveryId).toBe(deliveryId);

    // 6. Rider completes delivery
    const completeRes = await request(app)
      .post(`/api/deliveries/${deliveryId}/complete`)
      .set(authHeader(riderToken));

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.delivery.status).toBe('DELIVERED');

    // 7. Verify full history exists
    const historyRes = await request(app)
      .get(`/api/deliveries/${deliveryId}/history`)
      .set(authHeader(retailerToken));

    expect(historyRes.status).toBe(200);
    const statuses = historyRes.body.data.history.map((h) => h.newStatus);
    expect(statuses).toContain('OPEN');
    expect(statuses).toContain('ASSIGNED');
    expect(statuses).toContain('PICKED_UP');
    expect(statuses).toContain('DELIVERED');
  });
});

// ─── Delivery Creation ────────────────────────────────────────────────────────

describe('POST /api/deliveries — Creation', () => {
  it('rejects creation by a rider (not a retailer)', async () => {
    const { token } = await registerAndLogin(RIDER);
    const res = await request(app)
      .post('/api/deliveries')
      .set(authHeader(token))
      .send(DELIVERY_PAYLOAD);
    expect(res.status).toBe(403);
  });

  it('rejects creation by a dispatcher', async () => {
    const { token } = await registerAndLogin(DISPATCHER);
    const res = await request(app)
      .post('/api/deliveries')
      .set(authHeader(token))
      .send(DELIVERY_PAYLOAD);
    expect(res.status).toBe(403);
  });

  it('rejects creation with missing required fields', async () => {
    const { token } = await registerAndLogin(RETAILER);
    const res = await request(app)
      .post('/api/deliveries')
      .set(authHeader(token))
      .send({ customerName: 'John' }); // missing fields
    expect(res.status).toBe(400);
  });

  it('rejects creation with invalid phone number', async () => {
    const { token } = await registerAndLogin(RETAILER);
    const res = await request(app)
      .post('/api/deliveries')
      .set(authHeader(token))
      .send({ ...DELIVERY_PAYLOAD, customerPhone: '12345' });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated creation', async () => {
    const res = await request(app).post('/api/deliveries').send(DELIVERY_PAYLOAD);
    expect(res.status).toBe(401);
  });
});

// ─── Role Authorization ───────────────────────────────────────────────────────

describe('Role-based Authorization', () => {
  let retailerToken, dispatcherToken, riderToken, riderId, deliveryId;

  beforeEach(async () => {
    const r = await registerAndLogin(RETAILER);
    const d = await registerAndLogin(DISPATCHER);
    const ri = await registerAndLogin(RIDER);
    retailerToken = r.token;
    dispatcherToken = d.token;
    riderToken = ri.token;
    riderId = ri.user.id;

    const cr = await request(app)
      .post('/api/deliveries')
      .set(authHeader(retailerToken))
      .send(DELIVERY_PAYLOAD);
    deliveryId = cr.body.data.delivery.id;
  });

  it('retailer cannot assign a rider', async () => {
    const res = await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(retailerToken))
      .send({ riderId });
    expect(res.status).toBe(403);
  });

  it('rider cannot assign a rider', async () => {
    const res = await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(riderToken))
      .send({ riderId });
    expect(res.status).toBe(403);
  });

  it('dispatcher cannot create a delivery', async () => {
    const res = await request(app)
      .post('/api/deliveries')
      .set(authHeader(dispatcherToken))
      .send(DELIVERY_PAYLOAD);
    expect(res.status).toBe(403);
  });

  it('retailer cannot confirm pickup', async () => {
    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(retailerToken));
    expect(res.status).toBe(403);
  });

  it('dispatcher cannot confirm pickup', async () => {
    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(dispatcherToken));
    expect(res.status).toBe(403);
  });
});

// ─── Invalid Transitions ──────────────────────────────────────────────────────

describe('Invalid State Transitions', () => {
  let retailerToken, dispatcherToken, riderToken, riderId, deliveryId, qrToken;

  beforeEach(async () => {
    const r = await registerAndLogin(RETAILER);
    const d = await registerAndLogin(DISPATCHER);
    const ri = await registerAndLogin(RIDER);
    retailerToken = r.token;
    dispatcherToken = d.token;
    riderToken = ri.token;
    riderId = ri.user.id;

    const cr = await request(app)
      .post('/api/deliveries')
      .set(authHeader(retailerToken))
      .send(DELIVERY_PAYLOAD);
    deliveryId = cr.body.data.delivery.id;
    qrToken = cr.body.data.delivery.qrToken;
  });

  it('cannot pickup an OPEN (unassigned) delivery', async () => {
    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));
    expect(res.status).toBe(409);
  });

  it('cannot complete before pickup', async () => {
    await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId });

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/complete`)
      .set(authHeader(riderToken));
    expect(res.status).toBe(409);
  });

  it('cannot complete without QR verification', async () => {
    // Assign + Pickup
    await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId });
    await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));

    // Try to complete without verifying QR
    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/complete`)
      .set(authHeader(riderToken));
    expect(res.status).toBe(409);
  });

  it('cannot complete without proof of delivery', async () => {
    // Assign + Pickup + Verify
    await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId });
    await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));
    await request(app)
      .post(`/api/deliveries/${deliveryId}/verify`)
      .set(authHeader(riderToken))
      .send({ qrToken });

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/complete`)
      .set(authHeader(riderToken));
    expect(res.status).toBe(409);
  });

  it('rejects wrong QR token', async () => {
    await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId });
    await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/verify`)
      .set(authHeader(riderToken))
      .send({ qrToken: 'REFLEX-DEL-000001-wrongtoken' });
    expect(res.status).toBe(400);
  });

  it('rejects QR verification by wrong rider', async () => {
    const { token: rider2Token } = await registerAndLogin(RIDER_2);

    await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId });
    await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));

    const res = await request(app)
      .post(`/api/deliveries/${deliveryId}/verify`)
      .set(authHeader(rider2Token))
      .send({ qrToken });
    expect(res.status).toBe(403);
  });

  it('cannot reassign after pickup', async () => {
    const { user: rider2User } = await registerAndLogin(RIDER_2);

    await request(app)
      .patch(`/api/deliveries/${deliveryId}/assign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId });
    await request(app)
      .post(`/api/deliveries/${deliveryId}/pickup`)
      .set(authHeader(riderToken));

    const res = await request(app)
      .patch(`/api/deliveries/${deliveryId}/reassign`)
      .set(authHeader(dispatcherToken))
      .send({ riderId: rider2User.id });
    expect(res.status).toBe(409);
  });

  it('cannot access delivery belonging to another retailer', async () => {
    const { token: retailer2Token } = await registerAndLogin(RETAILER_2);
    const res = await request(app)
      .get(`/api/deliveries/${deliveryId}`)
      .set(authHeader(retailer2Token));
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent delivery', async () => {
    const res = await request(app)
      .get('/api/deliveries/999999')
      .set(authHeader(retailerToken));
    expect(res.status).toBe(404);
  });
});
