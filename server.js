import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Allow CORS for local dev / Vite preview
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const RAILWAY_API = process.env.RAILWAY_API || 'https://backend-production-7f0d0.up.railway.app/api';
const RIDER_PWA_URL = process.env.RIDER_PWA_URL || 'http://localhost:5173';

let cachedToken = null;

// In-memory persistent rider registry with seed fleet couriers
const registeredRiders = [
  {
    id: '4',
    code: 'RIDER-004',
    name: 'Brian Mutua',
    phone: '+254712345678',
    email: 'brian@rider.co.ke',
    hub: 'Westlands Hub',
    status: 'ACTIVE',
    pwaStatus: 'READY',
    ratings: 4.9,
    completedDeliveries: 156,
    onboardingToken: '7f82a91c4e91b00401brian04',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    onboardedAt: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: '5',
    code: 'RIDER-005',
    name: 'Grace Wanjiru',
    phone: '+254722334455',
    email: 'grace@rider.co.ke',
    hub: 'Kilimani Node',
    status: 'ACTIVE',
    pwaStatus: 'READY',
    ratings: 4.8,
    completedDeliveries: 98,
    onboardingToken: '8e93b02d5f02c00502grace05',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    onboardedAt: new Date(Date.now() - 20 * 86400000).toISOString()
  },
  {
    id: '6',
    code: 'RIDER-006',
    name: 'James Otieno',
    phone: '+254733445566',
    email: 'james@rider.co.ke',
    hub: 'CBD Depot',
    status: 'ACTIVE',
    pwaStatus: 'READY',
    ratings: 4.7,
    completedDeliveries: 114,
    onboardingToken: '9f04c13e6a13d00603james06',
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    onboardedAt: new Date(Date.now() - 15 * 86400000).toISOString()
  }
];

function generateOnboardingToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getOnboardingUrl(token) {
  return `${RIDER_PWA_URL}/join/${token}`;
}

async function getRailwayToken(role = 'dispatcher', riderId = null) {
  let email, password;
  
  if (role === 'dispatcher') {
    email = process.env.DISPATCHER_EMAIL || 'omondi@reflex.co.ke';
    password = process.env.DISPATCHER_PASSWORD || '';
  } else if (role === 'retailer') {
    email = process.env.RETAILER_EMAIL || 'kamau@electronics.co.ke';
    password = process.env.RETAILER_PASSWORD || '';
  } else if (role === 'rider') {
    if (String(riderId) === '5') {
      email = process.env.RIDER_EMAIL_GRACE || 'grace@rider.co.ke';
      password = process.env.RIDER_PASSWORD_GRACE || '';
    } else if (String(riderId) === '6') {
      email = process.env.RIDER_EMAIL_JAMES || 'james@rider.co.ke';
      password = process.env.RIDER_PASSWORD_JAMES || '';
    } else {
      email = process.env.RIDER_EMAIL_BRIAN || 'brian@rider.co.ke';
      password = process.env.RIDER_PASSWORD_BRIAN || '';
    }
  }
  
  try {
    const res = await fetch(`${RAILWAY_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: password || 'Password123!' })
    });
    const data = await res.json();
    if (data.success && data.data?.token) {
      cachedToken = data.data.token;
      return cachedToken;
    }
  } catch (err) {
    console.warn('Railway auth error:', err.message);
  }
  return cachedToken;
}

// Fetch live deliveries from Railway MySQL
async function fetchLiveDeliveries() {
  try {
    const token = cachedToken || (await getRailwayToken('dispatcher'));
    const res = await fetch(`${RAILWAY_API}/deliveries`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    if (res.ok) {
      const data = await res.json();
      return data.data?.deliveries || [];
    }
  } catch (err) {
    console.warn('Error fetching live deliveries from Railway:', err.message);
  }
  return [];
}

// ─── API ENDPOINTS ───

// 1. GET /api/live/deliveries (Deliveries list)
app.get('/api/live/deliveries', async (req, res) => {
  const list = await fetchLiveDeliveries();
  res.json({ success: true, deliveries: list });
});

// 2. GET /api/riders (List registered riders)
app.get('/api/riders', (req, res) => {
  const ridersWithLinks = registeredRiders.map((r) => ({
    ...r,
    onboardingUrl: getOnboardingUrl(r.onboardingToken)
  }));
  res.json({
    success: true,
    data: {
      riders: ridersWithLinks,
      count: ridersWithLinks.length
    }
  });
});

// 3. POST /api/riders (Register New Rider)
app.post('/api/riders', (req, res) => {
  const { name, phone, email, hub } = req.body || {};

  // Validation
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Full name is required.' });
  }

  if (!phone || !phone.trim()) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const cleanPhone = phone.trim();
  const phoneRegex = /^(\+?254|0)?[17]\d{8}$/;
  const digits = cleanPhone.replace(/\D/g, '');
  if (!phoneRegex.test(cleanPhone) && (digits.length < 9 || digits.length > 12)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid Kenyan phone number (e.g. +254712345678 or 0712345678).'
    });
  }

  // Duplicate Check
  const normalizedPhoneDigits = digits.slice(-9);
  const existing = registeredRiders.find(
    (r) => r.phone.replace(/\D/g, '').slice(-9) === normalizedPhoneDigits
  );
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `A rider with phone number ${phone} is already registered (${existing.name}).`,
      data: {
        rider: { ...existing, onboardingUrl: getOnboardingUrl(existing.onboardingToken) }
      }
    });
  }

  // Generate unique ID and secure crypto token
  const nextNumericId = registeredRiders.length + 4;
  const nextCode = `RIDER-${String(nextNumericId).padStart(3, '0')}`;
  const token = generateOnboardingToken();

  const newRider = {
    id: String(nextNumericId),
    code: nextCode,
    name: name.trim(),
    phone: cleanPhone.startsWith('0') ? `+254${cleanPhone.slice(1)}` : cleanPhone.startsWith('+') ? cleanPhone : `+254${cleanPhone}`,
    email: (email && email.trim()) || `${name.trim().toLowerCase().replace(/\s+/g, '.')}@rider.reflex.co.ke`,
    hub: (hub && hub.trim()) || 'Nairobi Central Dispatch',
    status: 'ACTIVE',
    pwaStatus: 'LINK_SENT',
    ratings: 5.0,
    completedDeliveries: 0,
    onboardingToken: token,
    createdAt: new Date().toISOString(),
    onboardedAt: null
  };

  registeredRiders.push(newRider);

  const onboardingUrl = getOnboardingUrl(token);

  console.log(`[RIDER REGISTERED] ${newRider.name} (${newRider.code}) -> Token: ${token}`);

  // Broadcast to connected dispatchers and retailers
  io.emit('rider_registered', newRider);
  io.emit('update_riders', registeredRiders);

  res.status(201).json({
    success: true,
    message: 'Rider registered successfully.',
    data: {
      rider: {
        ...newRider,
        onboardingUrl
      },
      onboardingUrl
    }
  });
});

// 4. POST /api/riders/:id/regenerate-link (Revoke old token and generate fresh link)
app.post('/api/riders/:id/regenerate-link', (req, res) => {
  const { id } = req.params;
  const rider = registeredRiders.find((r) => String(r.id) === String(id) || r.code === id);

  if (!rider) {
    return res.status(404).json({ success: false, message: 'Rider not found.' });
  }

  const newToken = generateOnboardingToken();
  rider.onboardingToken = newToken;
  rider.pwaStatus = 'LINK_SENT';

  const onboardingUrl = getOnboardingUrl(newToken);
  console.log(`[TOKEN REGENERATED] Rider #${id} ${rider.name} -> New Token: ${newToken}`);

  io.emit('update_riders', registeredRiders);

  res.json({
    success: true,
    message: 'New onboarding link generated successfully.',
    data: {
      rider: {
        ...rider,
        onboardingUrl
      },
      onboardingUrl
    }
  });
});

// 5. GET /api/rider/onboarding/:token (Validate rider onboarding token for PWA)
app.get('/api/rider/onboarding/:token', (req, res) => {
  const { token } = req.params;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Token parameter is required.' });
  }

  const rider = registeredRiders.find((r) => r.onboardingToken === token);

  if (!rider) {
    return res.status(404).json({
      success: false,
      message: 'Invalid or expired rider invitation token. Please contact your dispatcher.'
    });
  }

  if (rider.status === 'SUSPENDED') {
    return res.status(403).json({
      success: false,
      message: 'This rider account is suspended. Please contact dispatch.'
    });
  }

  // Mark as READY / ONBOARDED
  rider.pwaStatus = 'READY';
  if (!rider.onboardedAt) {
    rider.onboardedAt = new Date().toISOString();
  }

  io.emit('update_riders', registeredRiders);

  res.json({
    success: true,
    message: 'Rider token validated successfully.',
    data: {
      rider: {
        id: rider.id,
        code: rider.code,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        hub: rider.hub,
        status: rider.status,
        pwaStatus: rider.pwaStatus,
        token: rider.onboardingToken
      }
    }
  });
});

// 6. GET /api/riders/me (Get identified rider profile)
app.get('/api/riders/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  const riderId = req.query.riderId || req.headers['x-rider-id'];

  let rider = null;
  if (token) {
    rider = registeredRiders.find((r) => r.onboardingToken === token);
  }
  if (!rider && riderId) {
    rider = registeredRiders.find((r) => String(r.id) === String(riderId));
  }

  if (!rider) {
    return res.status(401).json({ success: false, message: 'Unauthorized rider session.' });
  }

  res.json({
    success: true,
    data: {
      rider: {
        id: rider.id,
        code: rider.code,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        hub: rider.hub,
        status: rider.status,
        ratings: rider.ratings,
        completedDeliveries: rider.completedDeliveries
      }
    }
  });
});

// 7. GET /api/riders/me/deliveries (Deliveries assigned to rider)
app.get('/api/riders/me/deliveries', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  const riderId = req.query.riderId || req.headers['x-rider-id'];

  let rider = null;
  if (token) {
    rider = registeredRiders.find((r) => r.onboardingToken === token);
  }
  if (!rider && riderId) {
    rider = registeredRiders.find((r) => String(r.id) === String(riderId));
  }

  const allDeliveries = await fetchLiveDeliveries();
  const targetId = rider ? String(rider.id) : String(riderId || '4');

  const filtered = allDeliveries.filter(
    (d) => String(d.riderId) === targetId || (!d.riderId && targetId === '4')
  );

  res.json({
    success: true,
    data: {
      deliveries: filtered,
      count: filtered.length
    }
  });
});

// ─── WEBSOCKET HANDLING ───
io.on('connection', async (socket) => {
  console.log('Client connected to Reflex Server:', socket.id);

  // Send real live state
  const initial = await fetchLiveDeliveries();
  socket.emit('init_data', initial);
  socket.emit('update_riders', registeredRiders);

  // Forward new delivery request to Railway
  socket.on('create_delivery', async (data) => {
    try {
      const retailerToken = await getRailwayToken('retailer');
      const res = await fetch(`${RAILWAY_API}/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${retailerToken}`
        },
        body: JSON.stringify({
          customerName: data.customer || data.customerName,
          customerPhone: data.phone || data.customerPhone,
          deliveryAddress: data.address || data.deliveryAddress,
          itemDescription: data.item || data.itemDescription
        })
      });
      const created = await res.json();
      console.log('Created order on Railway:', created);
      const updated = await fetchLiveDeliveries();
      io.emit('update_deliveries', updated);
    } catch (err) {
      console.error('Error creating delivery on Railway:', err.message);
    }
  });

  // Forward rider assignment to Railway & Emit delivery:assigned
  socket.on('assign_rider', async (data) => {
    try {
      const dispatcherToken = await getRailwayToken('dispatcher');
      let riderId = data.riderId;
      if (!riderId && data.rider) {
        const found = registeredRiders.find((r) => r.name.toLowerCase().includes(data.rider.toLowerCase()));
        if (found) riderId = found.id;
      }
      if (riderId) {
        await fetch(`${RAILWAY_API}/deliveries/${data.id}/assign`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${dispatcherToken}`
          },
          body: JSON.stringify({ riderId: Number(riderId) })
        });

        // Notify rider PWA specifically
        io.emit('delivery.assigned', {
          type: 'delivery.assigned',
          deliveryId: data.id,
          riderId: String(riderId)
        });
      }
      const updated = await fetchLiveDeliveries();
      io.emit('update_deliveries', updated);
    } catch (err) {
      console.error('Error assigning rider on Railway:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Periodic sync with Railway database every 6 seconds
setInterval(async () => {
  const live = await fetchLiveDeliveries();
  if (live && live.length > 0) {
    io.emit('update_deliveries', live);
  }
}, 6000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚡ REFLEX Control Plane Server active on http://localhost:${PORT}`);
  console.log(`🔗 Connected to Railway Backend: ${RAILWAY_API}`);
  console.log(`📱 Rider PWA URL Target: ${RIDER_PWA_URL}`);
});