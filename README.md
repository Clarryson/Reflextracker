<<<<<<< HEAD
 Droplink Web Frontend

The professional dispatcher and retailer control plane for the **Frop Link** real-time delivery platform, built with React, Vite, and Socket.io.

 Key Features
Dispatcher View: Create new delivery assignments with recipient phone numbers, item descriptions, and destination nodes.
Retailer Portal: Enterprise delivery ledger with live searching and status audit trails.
Real-Time Telemetry: Instant synchronization with backend web socket events.

 Getting Started
1. Run `npm install` to install dependencies.
2. Run `npm install socket.io-client` for real-time events.
3. Run `npm run dev` to launch the local development server.
=======
# REFLEX — Rider Mobile Progressive Web App (PWA) 🇰🇪

Mobile Rider Progressive Web Application for the **REFLEX Real-Time Delivery Tracking & Management Platform**, specifically engineered for Kenya's delivery ecosystem (motorcycle bodaboda riders, couriers, and couriers operating under intermittent network coverage).

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
├── apps/
│   └── mobile/
│       ├── public/
│       │   ├── manifest.json              # PWA Install manifest
│       │   └── favicon.svg
│       ├── src/
│       │   ├── components/
│       │   │   ├── CameraProofModal.jsx   # Native camera capture & preview
│       │   │   ├── QRScannerModal.jsx     # QR Code & PIN fallback modal
│       │   │   ├── DeliveryCard.jsx       # Delivery card & map deep links
│       │   │   ├── OfflineBanner.jsx      # Connection & pending sync bar
│       │   │   └── DeliverySummaryModal.jsx # Completion summary card
│       │   ├── screens/
│       │   │   ├── RiderHomeScreen.jsx    # Assigned tasks & standby view
│       │   │   └── ActiveDeliveryScreen.jsx # In-transit transit flow & hardware
│       │   ├── services/
│       │   │   ├── imageCompressor.js     # Canvas resize & watermark (<400KB)
│       │   │   ├── outboxStore.js         # IndexedDB mutation queue
│       │   │   └── api.js                 # REST client with offline fallback
│       │   ├── hooks/
│       │   │   ├── useRiderSocket.js      # Socket.io listeners, chime & vibration
│       │   │   └── useNetworkStatus.js    # Online/offline status & auto-flush
│       │   ├── App.jsx
│       │   ├── index.css
│       │   └── main.jsx
│       ├── package.json
│       └── vite.config.js
└── docs/
    ├── Connection.md
    ├── Delivery Completion.md
    ├── Internet.md
    ├── Proof Delivery.md
    └── Updates.md
```
>>>>>>> 1372660d9542104212b1c7163e4ac9d8a0fbeb94
