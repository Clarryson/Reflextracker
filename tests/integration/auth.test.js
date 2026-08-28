'use strict';

process.env.NODE_ENV = 'test';
require('dotenv').config();
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';

const request = require('supertest');
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

describe('POST /api/auth/register', () => {
  it('registers a new retailer successfully', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Kamau Electronics',
      email: 'kamau@electronics.co.ke',
      phone: '0712345678',
      password: 'Password123!',
      role: 'RETAILER',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('kamau@electronics.co.ke');
    expect(res.body.data.user.role).toBe('RETAILER');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('rejects duplicate email', async () => {
    const payload = {
      name: 'Test User',
      email: 'dup@test.com',
      phone: '0712345678',
      password: 'Password123!',
      role: 'RETAILER',
    };
    await request(app).post('/api/auth/register').send(payload);
    const res = await request(app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects invalid phone number', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test',
      email: 'test@test.com',
      phone: '12345',
      password: 'Password123!',
      role: 'RETAILER',
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid role', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test',
      email: 'test@test.com',
      phone: '0712345678',
      password: 'Password123!',
      role: 'SUPERADMIN',
    });
    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test',
      email: 'test@test.com',
      phone: '0712345678',
      password: 'abc',
      role: 'RETAILER',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Kamau',
      email: 'kamau@test.co.ke',
      phone: '0712345678',
      password: 'Password123!',
      role: 'RETAILER',
    });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'kamau@test.co.ke',
      password: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('RETAILER');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'kamau@test.co.ke',
      password: 'WrongPassword',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@nowhere.com',
      password: 'Password123!',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let token;
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Kamau',
      email: 'kamau@me.co.ke',
      phone: '0712345678',
      password: 'Password123!',
      role: 'RETAILER',
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'kamau@me.co.ke',
      password: 'Password123!',
    });
    token = loginRes.body.data.token;
  });

  it('returns current user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('kamau@me.co.ke');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer totally-fake-token');
    expect(res.status).toBe(401);
  });
});
