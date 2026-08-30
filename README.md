# REFLEX — Real-Time Delivery Tracking & Management Platform 🇰🇪

Enterprise delivery tracking and dispatcher control plane with an offline-first Rider Progressive Web App (PWA), engineered specifically for Kenya's delivery ecosystem (motorcycle bodaboda riders, couriers, and merchants operating under intermittent network coverage).

---

## 🏗️ Architecture Overview

- **Backend & Telemetry Gateway** (`server.js`): Real-time Socket.io and Express event routing engine.
- **Rider Mobile PWA** (`apps/mobile`): Offline-first outbox pattern, dual QR/PIN verification gates, canvas compression (<400KB), GPS telemetry, and screen WakeLock lifecycle management.
- **Dispatcher & Retailer Web Portal** (`apps/web`): Live control plane for order assignment, retailer ledgers, and telemetry monitoring.

---


## 📱 Features Built for Kenya Logistics

1. **Offline-First Outbox Pattern (IndexedDB)**:
   - Riders can confirm pickups, record dropoff proof, and log location points even when cellular data is dropped.
   - All mutations queue locally and automatically flush in FIFO order when internet reconnects.

2. **Client-Side Photo Compression (<400KB)**:
   - Off-screen HTML5 canvas compression reduces raw 5–15MB camera photos to under 400KB JPEG format before upload.
   - Embeds an audit watermark timestamp and GPS coordinates onto the photo evidence.

3. **Dual Verification Gate (QR Scanner + Manual PIN Fallback)**:
   - Live camera QR scanning with a large on-screen 6-digit numeric PIN fallback if the waybill is stained, wrinkled, or in dark lighting.

4. **Bodaboda One-Handed Ergonomics**:
   - High-contrast outdoor dark theme for sunlight visibility.
   - 56px minimum bottom-anchored thumb targets.
   - Multi-sensory notifications (Web Audio chime D5 to A5 + `navigator.vibrate` haptics).

5. **Battery & Hardware Lifecycle Teardown**:
   - Screen WakeLock (`navigator.wakeLock`) and GPS watchers run only during active `PICKED_UP` transit and immediately shut down on completion.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd apps/mobile
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) on your browser or mobile phone on the same Wi-Fi/LAN network.

### 3. Build for Production
```bash
npm run build
```

---

## 📂 Project Structure

```
REFLEX/
├── server.js                      # Real-time Socket.io & REST telemetry server
├── apps/
│   ├── mobile/                    # Rider Mobile PWA
│   │   ├── public/
│   │   │   ├── manifest.json      # PWA Install manifest
│   │   │   └── favicon.svg
│   │   ├── src/
│   │   │   ├── components/        # Camera, QR, Offline & Summary components
│   │   │   ├── screens/           # RiderHomeScreen & ActiveDeliveryScreen
│   │   │   ├── services/          # Canvas compressor, IndexedDB outbox, API
│   │   │   ├── hooks/             # Socket.io, vibrations & network sync hooks
│   │   │   └── App.jsx
│   │   ├── package.json
│   │   └── vite.config.js
│   └── web/                       # Dispatcher & Retailer Web Control Plane
│       ├── src/
│       │   ├── App.jsx            # Dispatcher form & Retailer ledger dashboard
│       │   └── index.css
│       ├── package.json
│       └── vite.config.js
└── docs/

    ├── Connection.md
    ├── Delivery Completion.md
    ├── Internet.md
    ├── Proof Delivery.md
    └── Updates.md
```

