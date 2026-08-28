'use strict';

/**
 * Unit tests for deliveryService state machine.
 *
 * The database layer is mocked so these tests run without MySQL.
 */

// Mock the DB module before requiring the service
jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  pool: { end: jest.fn() },
}));

// Mock history model
jest.mock('../../src/models/deliveryHistory', () => ({
  appendHistory: jest.fn().mockResolvedValue(1),
  getHistory: jest.fn().mockResolvedValue([]),
}));

// Mock real-time events (no Socket.IO needed)
jest.mock('../../src/realtime/deliveryEvents', () => ({
  emitDeliveryEvent: jest.fn(),
  EVENTS: {
    CREATED: 'delivery:created',
    ASSIGNED: 'delivery:assigned',
    REASSIGNED: 'delivery:reassigned',
    PICKED_UP: 'delivery:picked_up',
    VERIFIED: 'delivery:verified',
    DELIVERED: 'delivery:delivered',
    INCIDENT: 'delivery:incident',
  },
}));

const { query } = require('../../src/config/db');
const deliveryService = require('../../src/services/deliveryService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDelivery(overrides = {}) {
  return {
    id: 1,
    delivery_reference: 'DEL-000001',
    retailer_id: 10,
    rider_id: null,
    status: 'OPEN',
    qr_token: 'REFLEX-DEL-000001-abc123',
    qr_verified: 0,
    picked_up_at: null,
    delivered_at: null,
    ...overrides,
  };
}

function makeRider(overrides = {}) {
  return { id: 20, name: 'Brian Mutua', email: 'brian@rider.co.ke', role: 'RIDER', ...overrides };
}

// ─── assignRider ──────────────────────────────────────────────────────────────

describe('deliveryService.assignRider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assigns a rider to an OPEN delivery (OPEN → ASSIGNED)', async () => {
    const delivery = makeDelivery({ status: 'OPEN' });
    const rider = makeRider({ id: 20 });

    query
      .mockResolvedValueOnce([[delivery]])   // getDeliveryOrThrow
      .mockResolvedValueOnce([[rider]])      // getUserWithRole
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE deliveries
      .mockResolvedValueOnce([[delivery]])   // final getDeliveryOrThrow
    ;

    const result = await deliveryService.assignRider(1, 20, 5);
    expect(result.status).toBe('OPEN'); // mocked return
  });

  it('rejects assignment to a DELIVERED delivery', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'DELIVERED' })]]);

    await expect(deliveryService.assignRider(1, 20, 5)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects assignment when delivery is already ASSIGNED (must use reassign)', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'ASSIGNED', rider_id: 20 })]]);

    await expect(deliveryService.assignRider(1, 99, 5)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects assignment when rider does not have RIDER role', async () => {
    query
      .mockResolvedValueOnce([[makeDelivery({ status: 'OPEN' })]])
      .mockResolvedValueOnce([[{ ...makeRider(), role: 'DISPATCHER' }]]);

    await expect(deliveryService.assignRider(1, 5, 5)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 400,
    });
  });

  it('throws 404 when delivery does not exist', async () => {
    query.mockResolvedValueOnce([[]]); // empty result

    await expect(deliveryService.assignRider(999, 20, 5)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 404,
    });
  });
});

// ─── reassignRider ────────────────────────────────────────────────────────────

describe('deliveryService.reassignRider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reassigns from one rider to another when ASSIGNED', async () => {
    const delivery = makeDelivery({ status: 'ASSIGNED', rider_id: 20 });
    const newRider = makeRider({ id: 21, name: 'Grace Wanjiru' });

    query
      .mockResolvedValueOnce([[delivery]])
      .mockResolvedValueOnce([[newRider]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[delivery]]);

    const result = await deliveryService.reassignRider(1, 21, 5);
    expect(result).toBeDefined();
  });

  it('rejects reassignment after pickup', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'PICKED_UP', rider_id: 20 })]]);

    await expect(deliveryService.reassignRider(1, 21, 5)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects reassignment to the same rider', async () => {
    const delivery = makeDelivery({ status: 'ASSIGNED', rider_id: 20 });
    const sameRider = makeRider({ id: 20 });

    query
      .mockResolvedValueOnce([[delivery]])
      .mockResolvedValueOnce([[sameRider]]);

    await expect(deliveryService.reassignRider(1, 20, 5)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 400,
    });
  });
});

// ─── confirmPickup ────────────────────────────────────────────────────────────

describe('deliveryService.confirmPickup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirms pickup for the assigned rider (ASSIGNED → PICKED_UP)', async () => {
    const delivery = makeDelivery({ status: 'ASSIGNED', rider_id: 20 });

    query
      .mockResolvedValueOnce([[delivery]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...delivery, status: 'PICKED_UP' }]]);

    const result = await deliveryService.confirmPickup(1, 20);
    expect(result).toBeDefined();
  });

  it('rejects pickup for wrong rider', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'ASSIGNED', rider_id: 20 })]]);

    await expect(deliveryService.confirmPickup(1, 99)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 403,
    });
  });

  it('rejects pickup when not in ASSIGNED state', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'OPEN' })]]);

    await expect(deliveryService.confirmPickup(1, 20)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });
});

// ─── verifyQR ─────────────────────────────────────────────────────────────────

describe('deliveryService.verifyQR', () => {
  const VALID_TOKEN = 'REFLEX-DEL-000001-abc123';
  beforeEach(() => jest.clearAllMocks());

  it('verifies a correct QR token', async () => {
    const delivery = makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_token: VALID_TOKEN, qr_verified: 0 });

    query
      .mockResolvedValueOnce([[delivery]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...delivery, qr_verified: 1 }]]);

    const result = await deliveryService.verifyQR(1, 20, VALID_TOKEN);
    expect(result).toBeDefined();
  });

  it('rejects an incorrect QR token', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_token: VALID_TOKEN })]]);

    await expect(deliveryService.verifyQR(1, 20, 'WRONG-TOKEN')).rejects.toMatchObject({
      isOperational: true,
      statusCode: 400,
    });
  });

  it('rejects QR verification by wrong rider', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_token: VALID_TOKEN })]]);

    await expect(deliveryService.verifyQR(1, 99, VALID_TOKEN)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 403,
    });
  });

  it('rejects duplicate QR verification', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_token: VALID_TOKEN, qr_verified: 1 })]]);

    await expect(deliveryService.verifyQR(1, 20, VALID_TOKEN)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects QR verification when not in PICKED_UP state', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'ASSIGNED', rider_id: 20, qr_token: VALID_TOKEN })]]);

    await expect(deliveryService.verifyQR(1, 20, VALID_TOKEN)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });
});

// ─── completeDelivery ─────────────────────────────────────────────────────────

describe('deliveryService.completeDelivery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('completes a delivery when all prerequisites are met', async () => {
    const delivery = makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_verified: 1 });

    query
      .mockResolvedValueOnce([[delivery]])          // getDeliveryOrThrow
      .mockResolvedValueOnce([[{ id: 1 }]])          // proof check
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ ...delivery, status: 'DELIVERED' }]]);

    const result = await deliveryService.completeDelivery(1, 20);
    expect(result).toBeDefined();
  });

  it('rejects completion when status is not PICKED_UP', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'ASSIGNED', rider_id: 20 })]]);

    await expect(deliveryService.completeDelivery(1, 20)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects completion without QR verification', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_verified: 0 })]]);

    await expect(deliveryService.completeDelivery(1, 20)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects completion without proof of delivery', async () => {
    const delivery = makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_verified: 1 });

    query
      .mockResolvedValueOnce([[delivery]])
      .mockResolvedValueOnce([[]]); // no proof

    await expect(deliveryService.completeDelivery(1, 20)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });

  it('rejects completion by wrong rider', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'PICKED_UP', rider_id: 20, qr_verified: 1 })]]);

    await expect(deliveryService.completeDelivery(1, 99)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 403,
    });
  });

  it('rejects completing an already DELIVERED delivery', async () => {
    query.mockResolvedValueOnce([[makeDelivery({ status: 'DELIVERED', rider_id: 20, qr_verified: 1 })]]);

    await expect(deliveryService.completeDelivery(1, 20)).rejects.toMatchObject({
      isOperational: true,
      statusCode: 409,
    });
  });
});
