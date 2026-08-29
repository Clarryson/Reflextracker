# 🔌 REFLEX Frontend Integration Guide
> **For the Frontend Developer (Website + Rider PWA)**  
> Live Backend: **https://backend-production-7f0d0.up.railway.app**

---

## Overview

The REFLEX backend is fully deployed on Railway. This guide tells you everything you need to connect your frontend to it — no local server required.

---

## 🌐 Live API Base URL

```
https://backend-production-7f0d0.up.railway.app
```

All API requests go to this URL. In your code, set this as a constant:

```js
const API_BASE = 'https://backend-production-7f0d0.up.railway.app';
```

---

## 🔑 Authentication

### Login
**POST** `/api/auth/login`

```js
const res = await fetch(`${API_BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'Password123!' }),
});
const { data } = await res.json();
const token = data.token; // Store this in localStorage
```

### Using the token
All protected routes require an `Authorization` header:

```js
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
}
```

### Roles
| Role | Access |
|------|--------|
| `RETAILER` | Create deliveries, view own deliveries |
| `DISPATCHER` | Assign riders, view all deliveries |
| `RIDER` | View assigned deliveries, scan QR, upload proof |

---

## 📦 Core API Endpoints

### Deliveries

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/deliveries` | RETAILER/DISPATCHER | List deliveries |
| `POST` | `/api/deliveries` | RETAILER | Create a delivery |
| `GET` | `/api/deliveries/:id` | All | Get delivery detail |
| `PATCH` | `/api/deliveries/:id/assign` | DISPATCHER | Assign a rider |
| `PATCH` | `/api/deliveries/:id/pickup` | RIDER | Mark as picked up |
| `GET` | `/api/deliveries/:id/qr` | DISPATCHER | Get QR code image URL |

### QR Verification (Rider PWA)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/verify/:token` | Validate QR token, get delivery info |
| `POST` | `/api/verify/:token` | Submit proof of delivery (multipart/form-data) |

```js
// Submit proof — multipart form with photo
const formData = new FormData();
formData.append('photo', fileInput.files[0]);
formData.append('notes', 'Delivered to reception');

const res = await fetch(`${API_BASE}/api/verify/${token}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${riderToken}` },
  body: formData, // Do NOT set Content-Type — browser sets it with boundary
});
```

### Users / Riders

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/users/riders` | DISPATCHER | List available riders |

---

## ⚡ Real-Time Updates (Socket.IO)

The backend uses Socket.IO for live delivery status updates.

### Connect

```js
import { io } from 'socket.io-client';

const socket = io('https://backend-production-7f0d0.up.railway.app', {
  auth: { token: localStorage.getItem('token') },
});
```

Via CDN (no bundler):
```html
<script src="https://backend-production-7f0d0.up.railway.app/socket.io/socket.io.js"></script>
<script>
  const socket = io('https://backend-production-7f0d0.up.railway.app', {
    auth: { token: localStorage.getItem('token') }
  });
</script>
```

### Events to listen for

```js
// A delivery's status changed
socket.on('delivery:updated', (delivery) => {
  console.log('Delivery updated:', delivery.id, delivery.status);
  // Re-fetch or update your UI
});
```

---

## 🖼️ Accessing Uploaded Files (Proof Photos)

Proof-of-delivery photos are served at:

```
https://backend-production-7f0d0.up.railway.app/uploads/<filename>
```

The `proofUrl` field in the delivery object will give you the full path. Example:

```js
const delivery = await fetchDelivery(id);
const photoUrl = delivery.proofUrl; // Already a full URL
```

---

## 📲 QR Code Flow (Rider PWA)

1. Rider opens the verify page with the QR token in the URL:
   ```
   https://backend-production-7f0d0.up.railway.app/verify.html?token=<qr_token>
   ```
   Or your own frontend at a route like `/verify/:token`

2. Your app calls `GET /api/verify/:token` (with rider's JWT) to get delivery info
3. Rider reviews the delivery details
4. Rider takes a photo and submits `POST /api/verify/:token` with the proof photo
5. Delivery status changes to `DELIVERED` and all connected clients receive `delivery:updated`

---

## 🔐 Demo Accounts (for testing)

| Role | Email | Password |
|------|-------|----------|
| Retailer | `kamau@electronics.co.ke` | `Password123!` |
| Dispatcher | `dispatcher@reflex.co.ke` | `Password123!` |
| Rider | `wanjiku@riders.co.ke` | `Password123!` |

> ⚠️ These are seeded demo accounts. Do not use in production.

---

## 🔍 Health Check

```
GET https://backend-production-7f0d0.up.railway.app/health
```

Returns `{ "status": "ok", "timestamp": "..." }` — use this to verify the backend is up.

---

## 📬 CORS

The backend accepts requests from **any origin** (`*`) in production. You do not need to configure anything special for CORS.

---

## 💡 Tips

- Store the JWT token in `localStorage` and attach it to every authenticated request
- All list endpoints return `{ success: true, data: { deliveries: [...], total, page, ... } }`  
- Error responses return `{ success: false, message: "..." }` with appropriate HTTP status codes
- The rider `verify.html` page is already served from the backend — you can use it as a reference implementation

---

## 📂 Reference Files in This Repo

| File | What it is |
|------|-----------|
| `public/verify.html` | Rider QR-scan page (reference PWA) |
| `schema.sql` | Full DB schema (all tables & columns) |
| `src/routes/` | All API route definitions |
| `.env.example` | All environment variables the backend uses |
