'use strict';

const jwt = require('jsonwebtoken');

let ioInstance = null;

/**
 * Initialise Socket.IO on the given HTTP server.
 * Call this once from server.js before app.listen().
 *
 * @param {import('http').Server} httpServer
 * @param {string[]} allowedOrigins
 * @returns {import('socket.io').Server}
 */
function initSocket(httpServer, allowedOrigins) {
  const { Server } = require('socket.io');

  ioInstance = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // Authenticate incoming socket connections via JWT query param
  ioInstance.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required.'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Invalid or expired token.'));
    }
  });

  ioInstance.on('connection', (socket) => {
    console.log(`[Socket.IO] Connected: user ${socket.user?.id} (${socket.user?.role})`);

    /**
     * Clients join a delivery-specific room to receive updates.
     * Payload: { deliveryId: number }
     */
    socket.on('join:delivery', ({ deliveryId }) => {
      if (!deliveryId) return;
      const room = `delivery:${deliveryId}`;
      socket.join(room);
      console.log(`[Socket.IO] User ${socket.user?.id} joined room ${room}`);
    });

    socket.on('leave:delivery', ({ deliveryId }) => {
      if (!deliveryId) return;
      socket.leave(`delivery:${deliveryId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Disconnected: user ${socket.user?.id}`);
    });
  });

  return ioInstance;
}

/**
 * Returns the active Socket.IO instance.
 * Throws if called before initSocket().
 * @returns {import('socket.io').Server}
 */
function getIo() {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialised. Call initSocket() first.');
  }
  return ioInstance;
}

module.exports = { initSocket, getIo };
