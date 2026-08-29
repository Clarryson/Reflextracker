'use strict';

require('dotenv').config();
const http = require('http');
const os = require('os');
const app = require('./app');
const { setPublicUrl } = require('./app');
const { initSocket } = require('./realtime/socket');

const PORT = parseInt(process.env.PORT || '5000', 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Initialise Socket.IO on the same server
initSocket(server, allowedOrigins);

// Detect local network IP (for same-WiFi phone access in dev)
function getLocalIp() {
  const nets = os.networkInterfaces();
  let fallback = 'localhost';
  for (const [name, net] of Object.entries(nets)) {
    const lower = name.toLowerCase();
    const isVirtual =
      lower.includes('vethernet') ||
      lower.includes('wsl') ||
      lower.includes('virtual') ||
      lower.includes('docker') ||
      lower.includes('loopback');
    for (const n of net) {
      if (n.family === 'IPv4' && !n.internal) {
        if (!isVirtual) return n.address;
        if (fallback === 'localhost') fallback = n.address;
      }
    }
  }
  return fallback;
}

const localIp = getLocalIp();
const localNetworkUrl = `http://${localIp}:${PORT}`;

server.listen(PORT, '0.0.0.0', async () => {
  // ── Production / Railway: PUBLIC_BASE_URL is set — use it directly, no tunnel ──
  if (process.env.PUBLIC_BASE_URL) {
    const rawUrl = process.env.PUBLIC_BASE_URL;
    const publicUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    setPublicUrl(publicUrl);

    console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │   🚚  Reflex Delivery Tracker API                        │
  │   Environment : ${(process.env.NODE_ENV || 'production').padEnd(37)} │
  │   Port        : ${String(PORT).padEnd(37)} │
  │   Public URL  : ${publicUrl.padEnd(37)} │
  └──────────────────────────────────────────────────────────┘
  `);
    return;
  }

  // ── Development: log local URLs then optionally start localtunnel ──
  console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │   🚚  Reflex Delivery Tracker API                        │
  │   Environment : ${(process.env.NODE_ENV || 'development').padEnd(37)} │
  │   Port        : ${String(PORT).padEnd(37)} │
  │   Local       : http://localhost:${PORT}                  │
  │   Network     : ${localNetworkUrl.padEnd(37)} │
  └──────────────────────────────────────────────────────────┘
  `);

  if ((process.env.NODE_ENV || 'development') === 'development') {
    try {
      const localtunnel = require('localtunnel');
      const tunnel = await localtunnel({ port: PORT });
      setPublicUrl(tunnel.url);

      console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │   🌐  Public Tunnel Active                               │
  │   URL: ${tunnel.url.padEnd(49)} │
  │   QR codes will use this URL — scannable by any phone!   │
  └──────────────────────────────────────────────────────────┘
  `);

      tunnel.on('close', () => {
        setPublicUrl(null);
        console.log('[Tunnel] Closed. Falling back to local network URL.');
      });
    } catch (err) {
      console.log(
        `[Tunnel] localtunnel unavailable (${err.message}). Using local network: ${localNetworkUrl}`
      );
    }
  }
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
