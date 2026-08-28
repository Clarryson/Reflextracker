'use strict';

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./realtime/socket');

const PORT = parseInt(process.env.PORT || '5000', 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Initialise Socket.IO on the same server
initSocket(server, allowedOrigins);

server.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────────────┐
  │   🚚  Reflex Delivery Tracker API               │
  │   Environment : ${(process.env.NODE_ENV || 'development').padEnd(28)} │
  │   Port        : ${String(PORT).padEnd(28)} │
  │   REST API    : http://localhost:${PORT}/api      │
  │   Health      : http://localhost:${PORT}/health   │
  └─────────────────────────────────────────────────┘
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully…');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

module.exports = server; // exported for supertest
