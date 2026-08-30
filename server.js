const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAILWAY_API = process.env.RAILWAY_API || 'https://backend-production-7f0d0.up.railway.app/api';

let cachedToken = null;

async function getRailwayToken(email = 'omondi@reflex.co.ke') {
  try {
    const res = await fetch(`${RAILWAY_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!' })
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
    const token = cachedToken || (await getRailwayToken());
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

// API proxy endpoints for public client
app.get('/api/live/deliveries', async (req, res) => {
  const list = await fetchLiveDeliveries();
  res.json({ success: true, deliveries: list });
});

io.on('connection', async (socket) => {
  console.log('User connected to Express server:', socket.id);

  // Send real live state from Railway
  const initial = await fetchLiveDeliveries();
  socket.emit('init_data', initial);

  // Forward new delivery request to Railway
  socket.on('create_delivery', async (data) => {
    try {
      const retailerToken = await getRailwayToken('kamau@electronics.co.ke');
      const res = await fetch(`${RAILWAY_API}/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${retailerToken}`
        },
        body: JSON.stringify({
          customerName: data.customer,
          customerPhone: data.phone,
          deliveryAddress: data.address,
          itemDescription: data.item
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

  // Forward rider assignment to Railway
  socket.on('assign_rider', async (data) => {
    try {
      const dispatcherToken = await getRailwayToken('omondi@reflex.co.ke');
      let riderId = data.riderId;
      if (!riderId && data.rider) {
        if (data.rider.includes('Brian')) riderId = 4;
        else if (data.rider.includes('Grace')) riderId = 5;
        else if (data.rider.includes('James')) riderId = 6;
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
      }
      const updated = await fetchLiveDeliveries();
      io.emit('update_deliveries', updated);
    } catch (err) {
      console.error('Error assigning rider on Railway:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
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
  console.log(`Reflex live proxy server running on http://localhost:${PORT} linked to Railway: ${RAILWAY_API}`);
});