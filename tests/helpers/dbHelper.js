'use strict';

/**
 * Test database helper.
 *
 * Runs migrations on the test database and truncates tables between suites.
 * Set NODE_ENV=test in .env.test or before running.
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const { pool } = require('../../src/config/db');

const TABLE_ORDER = [
  'incidents',
  'proof_of_delivery',
  'delivery_history',
  'deliveries',
  'users',
];

async function createTables() {
  // Inline the migration SQL so the helper is self-contained
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('RETAILER','DISPATCHER','RIDER') NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        delivery_reference VARCHAR(20) NOT NULL UNIQUE,
        retailer_id INT UNSIGNED NOT NULL,
        rider_id INT UNSIGNED NULL,
        customer_name VARCHAR(120) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        delivery_address TEXT NOT NULL,
        item_description TEXT NOT NULL,
        status ENUM('OPEN','ASSIGNED','PICKED_UP','DELIVERED','CANCELLED','FAILED','INCIDENT') NOT NULL DEFAULT 'OPEN',
        qr_token VARCHAR(100) NOT NULL,
        qr_verified TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        picked_up_at DATETIME NULL,
        delivered_at DATETIME NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_delivery_retailer FOREIGN KEY (retailer_id) REFERENCES users(id),
        CONSTRAINT fk_test_delivery_rider FOREIGN KEY (rider_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS delivery_history (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        delivery_id INT UNSIGNED NOT NULL,
        changed_by INT UNSIGNED NOT NULL,
        previous_status VARCHAR(20) NULL,
        new_status VARCHAR(20) NOT NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_history_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
        CONSTRAINT fk_test_history_user FOREIGN KEY (changed_by) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS proof_of_delivery (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        delivery_id INT UNSIGNED NOT NULL UNIQUE,
        rider_id INT UNSIGNED NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_pod_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
        CONSTRAINT fk_test_pod_rider FOREIGN KEY (rider_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS incidents (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        delivery_id INT UNSIGNED NOT NULL,
        reported_by INT UNSIGNED NOT NULL,
        incident_type ENUM('CUSTOMER_UNAVAILABLE','WRONG_ADDRESS','DAMAGED_ITEM','VEHICLE_PROBLEM','OTHER') NOT NULL,
        description TEXT NOT NULL,
        status ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_incident_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
        CONSTRAINT fk_test_incident_user FOREIGN KEY (reported_by) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally {
    conn.release();
  }
}

async function truncateTables() {
  const conn = await pool.getConnection();
  try {
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLE_ORDER) {
      await conn.execute(`TRUNCATE TABLE ${table}`);
    }
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { createTables, truncateTables, closePool };
