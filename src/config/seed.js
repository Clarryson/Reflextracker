'use strict';

/**
 * Reflex Tracker — Database Seed Script
 *
 * Inserts realistic Kenyan demo data:
 *  - 2 Retailers
 *  - 1 Dispatcher
 *  - 3 Riders
 *  - 4 sample deliveries in various states
 *
 * Usage:
 *   npm run seed
 *
 * WARNING: Truncates all tables before inserting.
 *          Do NOT run in production.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Password123!';

async function seed() {
  console.log('🌱 Seeding database…');

  const conn = await pool.getConnection();
  try {
    // Disable FK checks so we can truncate freely
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
    await conn.execute('TRUNCATE TABLE incidents');
    await conn.execute('TRUNCATE TABLE proof_of_delivery');
    await conn.execute('TRUNCATE TABLE delivery_history');
    await conn.execute('TRUNCATE TABLE deliveries');
    await conn.execute('TRUNCATE TABLE users');
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('  ✓ Tables truncated');

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    // ── Users ───────────────────────────────────────────────────────────────
    const users = [
      // Retailers
      ['Kamau Electronics', 'kamau@electronics.co.ke', '0712345678', hash, 'RETAILER'],
      ['Aisha Pharma', 'aisha@pharma.co.ke', '0723456789', hash, 'RETAILER'],
      // Dispatcher
      ['Dispatcher Omondi', 'omondi@reflex.co.ke', '0734567890', hash, 'DISPATCHER'],
      // Riders
      ['Rider Brian Mutua', 'brian@rider.co.ke', '0745678901', hash, 'RIDER'],
      ['Rider Grace Wanjiru', 'grace@rider.co.ke', '0756789012', hash, 'RIDER'],
      ['Rider James Otieno', 'james@rider.co.ke', '0767890123', hash, 'RIDER'],
    ];

    const userIds = {};
    for (const [name, email, phone, pwd, role] of users) {
      const [result] = await conn.execute(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone, pwd, role]
      );
      userIds[email] = result.insertId;
      console.log(`  ✓ user: ${name} (${role})`);
    }

    const retailer1 = userIds['kamau@electronics.co.ke'];
    const retailer2 = userIds['aisha@pharma.co.ke'];
    const dispatcher = userIds['omondi@reflex.co.ke'];
    const rider1 = userIds['brian@rider.co.ke'];
    const rider2 = userIds['grace@rider.co.ke'];

    // ── Deliveries ──────────────────────────────────────────────────────────
    const deliveries = [
      {
        ref: 'DEL-000001',
        retailerId: retailer1,
        riderId: null,
        customerName: 'John Kamau',
        customerPhone: '0712345678',
        address: 'Kilimani, Nairobi',
        item: 'Samsung Galaxy A15',
        status: 'OPEN',
        qrToken: 'REFLEX-DEL-000001-aabbcc1122334455667788990011aabb',
      },
      {
        ref: 'DEL-000002',
        retailerId: retailer1,
        riderId: rider1,
        customerName: 'Mary Wambui',
        customerPhone: '0798765432',
        address: 'Westlands, Nairobi',
        item: 'HP Laptop Charger',
        status: 'ASSIGNED',
        qrToken: 'REFLEX-DEL-000002-bbccdd2233445566778899001122bbcc',
      },
      {
        ref: 'DEL-000003',
        retailerId: retailer2,
        riderId: rider2,
        customerName: 'Peter Mwangi',
        customerPhone: '0701234567',
        address: 'Karen, Nairobi',
        item: 'Blood Pressure Monitor',
        status: 'PICKED_UP',
        qrToken: 'REFLEX-DEL-000003-ccddee3344556677889900112233ccdd',
        pickedUpAt: new Date(),
      },
      {
        ref: 'DEL-000004',
        retailerId: retailer2,
        riderId: rider1,
        customerName: 'Fatuma Hassan',
        customerPhone: '0711223344',
        address: 'South B, Nairobi',
        item: 'Glucometer Kit',
        status: 'DELIVERED',
        qrToken: 'REFLEX-DEL-000004-ddeeff4455667788990011223344ddee',
        pickedUpAt: new Date(Date.now() - 3_600_000),
        deliveredAt: new Date(),
        qrVerified: 1,
      },
    ];

    const deliveryIds = {};
    for (const d of deliveries) {
      const [result] = await conn.execute(
        `INSERT INTO deliveries
           (delivery_reference, retailer_id, rider_id, customer_name, customer_phone,
            delivery_address, item_description, status, qr_token, qr_verified,
            picked_up_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.ref, d.retailerId, d.riderId ?? null,
          d.customerName, d.customerPhone,
          d.address, d.item, d.status, d.qrToken,
          d.qrVerified ?? 0,
          d.pickedUpAt ?? null,
          d.deliveredAt ?? null,
        ]
      );
      deliveryIds[d.ref] = result.insertId;
      console.log(`  ✓ delivery: ${d.ref} (${d.status})`);
    }

    // ── Delivery History ─────────────────────────────────────────────────────
    const historyRows = [
      // DEL-000001
      [deliveryIds['DEL-000001'], retailer1, null, 'OPEN', 'Delivery created'],
      // DEL-000002
      [deliveryIds['DEL-000002'], retailer1, null, 'OPEN', 'Delivery created'],
      [deliveryIds['DEL-000002'], dispatcher, 'OPEN', 'ASSIGNED', `Assigned to rider ${rider1}`],
      // DEL-000003
      [deliveryIds['DEL-000003'], retailer2, null, 'OPEN', 'Delivery created'],
      [deliveryIds['DEL-000003'], dispatcher, 'OPEN', 'ASSIGNED', `Assigned to rider ${rider2}`],
      [deliveryIds['DEL-000003'], rider2, 'ASSIGNED', 'PICKED_UP', 'Rider confirmed pickup'],
      // DEL-000004
      [deliveryIds['DEL-000004'], retailer2, null, 'OPEN', 'Delivery created'],
      [deliveryIds['DEL-000004'], dispatcher, 'OPEN', 'ASSIGNED', `Assigned to rider ${rider1}`],
      [deliveryIds['DEL-000004'], rider1, 'ASSIGNED', 'PICKED_UP', 'Rider confirmed pickup'],
      [deliveryIds['DEL-000004'], rider1, 'PICKED_UP', 'DELIVERED', 'Delivery completed'],
    ];

    for (const [deliveryId, changedBy, prevStatus, newStatus, notes] of historyRows) {
      await conn.execute(
        'INSERT INTO delivery_history (delivery_id, changed_by, previous_status, new_status, notes) VALUES (?, ?, ?, ?, ?)',
        [deliveryId, changedBy, prevStatus, newStatus, notes]
      );
    }
    console.log('  ✓ delivery_history rows inserted');

    console.log('\n✅ Seed complete.');
    console.log(`\n🔐 All accounts use password: ${DEFAULT_PASSWORD}`);
    console.log('\nDemo accounts:');
    console.log('  Retailer:   kamau@electronics.co.ke');
    console.log('  Retailer:   aisha@pharma.co.ke');
    console.log('  Dispatcher: omondi@reflex.co.ke');
    console.log('  Rider:      brian@rider.co.ke');
    console.log('  Rider:      grace@rider.co.ke');
    console.log('  Rider:      james@rider.co.ke');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
