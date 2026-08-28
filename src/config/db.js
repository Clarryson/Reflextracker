'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

const isTest = process.env.NODE_ENV === 'test';

// Railway can provide MYSQL_URL or DATABASE_URL, or individual MYSQL* vars
const connectionUri = isTest
  ? process.env.DATABASE_URL_TEST
  : (process.env.MYSQL_URL || process.env.DATABASE_URL);

let pool;

if (connectionUri) {
  pool = mysql.createPool({
    uri: connectionUri,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00',
    dateStrings: false,
  });
} else {
  pool = mysql.createPool({
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306', 10),
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: isTest
      ? process.env.DB_NAME_TEST || 'reflex_tracker_test'
      : (process.env.MYSQLDATABASE || process.env.DB_NAME || 'reflex_tracker'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00',
    dateStrings: false,
  });
}

/**
 * Execute a query against the pool.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<[any, any]>}
 */
async function query(sql, params = []) {
  return pool.execute(sql, params);
}

module.exports = { pool, query };
