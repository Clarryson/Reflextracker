'use strict';

/**
 * Reflex Tracker — Database Migration Script
 *
 * Creates all tables in dependency order.
 * Safe to run multiple times (uses IF NOT EXISTS).
 *
 * Usage:
 *   npm run migrate
 *   NODE_ENV=test npm run migrate
 */

require('dotenv').config();
const { pool } = require('./db');

const CREATE_USERS = `
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)    NOT NULL,
  email         VARCHAR(255)    NOT NULL UNIQUE,
  phone         VARCHAR(20)     NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM('RETAILER','DISPATCHER','RIDER') NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_DELIVERIES = `
CREATE TABLE IF NOT EXISTS deliveries (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  delivery_reference  VARCHAR(20)   NOT NULL UNIQUE,
  retailer_id         INT UNSIGNED  NOT NULL,
  rider_id            INT UNSIGNED  NULL,
  customer_name       VARCHAR(120)  NOT NULL,
  customer_phone      VARCHAR(20)   NOT NULL,
  delivery_address    TEXT          NOT NULL,
  item_description    TEXT          NOT NULL,
  status              ENUM('OPEN','ASSIGNED','PICKED_UP','DELIVERED','CANCELLED','FAILED','INCIDENT')
                      NOT NULL DEFAULT 'OPEN',
  qr_token            VARCHAR(100)  NOT NULL,
  qr_verified         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  picked_up_at        DATETIME      NULL,
  delivered_at        DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_deliveries_status     (status),
  INDEX idx_deliveries_retailer   (retailer_id),
  INDEX idx_deliveries_rider      (rider_id),
  CONSTRAINT fk_delivery_retailer FOREIGN KEY (retailer_id) REFERENCES users(id),
  CONSTRAINT fk_delivery_rider    FOREIGN KEY (rider_id)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_DELIVERY_HISTORY = `
CREATE TABLE IF NOT EXISTS delivery_history (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  delivery_id     INT UNSIGNED  NOT NULL,
  changed_by      INT UNSIGNED  NOT NULL,
  previous_status VARCHAR(20)   NULL,
  new_status      VARCHAR(20)   NOT NULL,
  notes           TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_history_delivery (delivery_id),
  CONSTRAINT fk_history_delivery   FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
  CONSTRAINT fk_history_changed_by FOREIGN KEY (changed_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_PROOF_OF_DELIVERY = `
CREATE TABLE IF NOT EXISTS proof_of_delivery (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  delivery_id INT UNSIGNED  NOT NULL UNIQUE,
  rider_id    INT UNSIGNED  NOT NULL,
  file_url    VARCHAR(500)  NOT NULL,
  file_type   VARCHAR(50)   NOT NULL,
  uploaded_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pod_delivery (delivery_id),
  CONSTRAINT fk_pod_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
  CONSTRAINT fk_pod_rider    FOREIGN KEY (rider_id)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_INCIDENTS = `
CREATE TABLE IF NOT EXISTS incidents (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  delivery_id   INT UNSIGNED  NOT NULL,
  reported_by   INT UNSIGNED  NOT NULL,
  incident_type ENUM(
    'CUSTOMER_UNAVAILABLE',
    'WRONG_ADDRESS',
    'DAMAGED_ITEM',
    'VEHICLE_PROBLEM',
    'OTHER'
  ) NOT NULL,
  description   TEXT          NOT NULL,
  status        ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_incidents_delivery (delivery_id),
  CONSTRAINT fk_incident_delivery     FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
  CONSTRAINT fk_incident_reported_by  FOREIGN KEY (reported_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function migrate() {
  console.log('🔄 Running migrations…');
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(CREATE_USERS);
      console.log('  ✓ users');
      await conn.execute(CREATE_DELIVERIES);
      console.log('  ✓ deliveries');
      await conn.execute(CREATE_DELIVERY_HISTORY);
      console.log('  ✓ delivery_history');
      await conn.execute(CREATE_PROOF_OF_DELIVERY);
      console.log('  ✓ proof_of_delivery');
      await conn.execute(CREATE_INCIDENTS);
      console.log('  ✓ incidents');
      console.log('✅ All migrations complete.');
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
