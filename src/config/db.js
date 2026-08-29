'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

const isTest = process.env.NODE_ENV === 'test';

// When running locally via Railway CLI, use public TCP proxy if available
const isLocal = !process.env.RAILWAY_STATIC_URL && !process.env.RAILWAY_ENVIRONMENT_NAME_OVERRIDE;
const tcpDomain = process.env.RAILWAY_TCP_PROXY_DOMAIN;
const tcpPort = process.env.RAILWAY_TCP_PROXY_PORT;

let host = process.env.MYSQLHOST || process.env.DB_HOST || 'localhost';
let port = parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306', 10);

// If host is internal railway domain but we have a public TCP proxy
if (tcpDomain && host === 'mysql.railway.internal') {
  host = tcpDomain;
  port = parseInt(tcpPort || '3306', 10);
}

let connectionUri = isTest
  ? process.env.DATABASE_URL_TEST
  : (process.env.MYSQL_URL || process.env.DATABASE_URL);

if (connectionUri && tcpDomain && connectionUri.includes('mysql.railway.internal')) {
  // Replace internal host with public proxy
  connectionUri = connectionUri.replace('mysql.railway.internal:3306', `${tcpDomain}:${tcpPort}`);
}

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
    host,
    port,
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: isTest
      ? process.env.DB_NAME_TEST || 'reflex_tracker_test'
      : (process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway'),
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
