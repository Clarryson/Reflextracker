'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const riderRoutes = require('./routes/riderRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { sendError } = require('./utils/response');

const app = express();

// Public base URL — set by server.js once localtunnel starts
let _publicBaseUrl = null;
function setPublicUrl(url) { _publicBaseUrl = url; }

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5000,http://localhost:5173,http://127.0.0.1:5000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow local development origins (localhost, 127.0.0.1, LAN IPs: 192.168.x, 10.x, 172.x, and localtunnel)
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('http://192.168.') ||
        origin.startsWith('http://10.') ||
        origin.startsWith('http://172.') ||
        origin.includes('.loca.lt') ||
        origin.includes('.ngrok') ||
        (process.env.NODE_ENV || 'development') === 'development'
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS policy: origin ${origin} not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder'],
  })
);

// ─── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Request logger (dev only) ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ─── Static files (proof uploads & test frontend) ─────────────────────────────
app.use(express.static('public'));
app.use(
  '/uploads',
  express.static(process.env.UPLOAD_DIR ? process.env.UPLOAD_DIR.split('/')[0] : 'uploads')
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/riders', riderRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Config endpoint — exposes public tunnel URL to frontend for QR code generation
app.get('/api/config', (_req, res) => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIp = 'localhost';
  for (const [name, net] of Object.entries(nets)) {
    const lower = name.toLowerCase();
    const isVirtual = lower.includes('vethernet') || lower.includes('wsl') || lower.includes('virtual') || lower.includes('docker') || lower.includes('loopback');
    for (const n of net) {
      if (n.family === 'IPv4' && !n.internal) {
        if (!isVirtual) {
          localIp = n.address;
          break;
        }
        if (localIp === 'localhost') localIp = n.address;
      }
    }
  }
  const port = process.env.PORT || 5000;
  const localUrl = `http://${localIp}:${port}`;
  res.json({
    success: true,
    data: {
      publicUrl: _publicBaseUrl || localUrl,
      localUrl,
      port
    }
  });
});

// 404
app.use((_req, res) => {
  sendError(res, 'Route not found.', 404);
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
module.exports.setPublicUrl = setPublicUrl;
