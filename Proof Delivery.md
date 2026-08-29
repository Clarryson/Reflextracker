# REFLEX — Proof of Delivery (PoD) Photo Capture Specification

This document details the architectural requirements, client-side media processing, and submission flows for capturing dropoff photo evidence in `apps/mobile`.

---

## 1. Camera Access & Capture Strategy

In mobile browsers and progressive web apps, photo capture must be reliable across varying OS camera permissions and browser security contexts.

### Dual-Method Capture Strategy:
1. **Primary Method (Native Camera Launcher):**
   - Use standard HTML file input elements configured with `accept="image/*"` and `capture="environment"`.
   - **Advantage:** Directly launches the device’s native camera application, handling native auto-focus, HDR, flash, and orientation automatically without maintaining a continuous WebRTC video stream.
2. **Alternative / Embedded Method (HTML5 Video Stream):**
   - Request `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` rendered into an in-app viewfinder canvas.
   - **Advantage:** Keeps the rider inside the app interface without switching out to the OS camera.

---

## 2. Client-Side Image Compression Pipeline

Modern smartphone cameras capture images between 5MB and 15MB. Transmitting raw photos over fluctuating cellular data causes upload timeouts and battery drain. All images must be compressed before network transfer or local caching.

```text
┌─────────────────┐       HTML5 Canvas Resize       ┌──────────────────┐
│ Captured Photo  │ ──────────────────────────────► │ Compressed Blob  │
│ (Raw 5–15 MB)   │   Max: 1280x960, JPEG Q=0.7     │ (Target <400 KB) │
└─────────────────┘                                 └─────────┬────────┘
                                                               │
                             ┌─────────────────────────┴─────────────────────────┐
                             ▼                                                   ▼
                  ┌─────────────────────┐                             ┌─────────────────────┐
                  │   Online: REST API  │                             │  Offline: IndexedDB │
                  │ (multipart/form-data│                             │  (Stored in Outbox  │
                  │    or Base64 JSON)  │                             │    Mutation Queue)  │
                  └─────────────────────┘                             └─────────────────────┘
```

### Compression Requirements:
- **Maximum Resolution:** Scale dimensions down to a maximum width/height of 1280px (preserving aspect ratio).
- **Target File Size:** Under 400 KB.
- **Format:** Image `JPEG` or `WebP` with a quality compression factor of `0.7` to `0.8`.
- **Canvas Processing:** Render the captured file into an offscreen HTML `<canvas>` element and extract the compressed blob via `canvas.toBlob()`.

---

## 3. Metadata & Audit Watermarking

To establish valid delivery evidence and prevent dispute fraud, tie delivery metadata directly to the captured photo.

- **Embedded Canvas Watermark (Optional):** Render small, high-contrast overlay text at the bottom edge of the image canvas before blob conversion containing:
  - Delivery UUID snippet.
  - Dropoff GPS coordinates (`Lat`, `Lng`).
  - UTC Timestamp.
- **Payload Metadata:** Send dropoff coordinates and device timestamp alongside the photo payload to match the backend `LocationLog`.

---

## 4. UI/UX & Rider Review Flow

- **Two-Step Confirmation:** After taking a photo, immediately display a preview screen with two distinct actions:
  - **Retake:** Clears current blob and reopens the camera (for blurry shots).
  - **Use Photo:** Accepts the image and unlocks the final "Complete Delivery" action.
- **Thumb-Zone Placement:** Keep "Retake" and "Confirm Photo" buttons anchored to the bottom 30% of the screen.
- **Visual Status Indicator:** Display a green thumbnail preview on the main delivery card once photo capture is confirmed.

---

## 5. Offline Storage & Background Sync

If a delivery is completed in a location without cellular data (e.g., parking garages, building basements):

1. **Local Blob Storage:** Store the compressed image binary (`Blob` or base64 data string) directly in the IndexedDB `outbox_mutations` store.
2. **Prevent Memory Leaks:** Avoid holding uncompressed `ImageBitmap` objects or raw file references in global memory.
3. **Queue Payload:** Attach the image blob to the `POST /api/deliveries/:id/verify` mutation payload inside the outbox.
4. **Automatic Flush:** When the device regains network connectivity, the service worker or sync manager uploads the queued photo without requiring rider intervention.

---

## 6. Backend Contract Alignment

The photo proof can be transmitted using one of two standards agreed upon with the Backend Developer:

- **Standard REST Upload:** `multipart/form-data` sent to `POST /api/deliveries/:id/verify` containing fields `verificationCode` (text) and `proofImage` (file binary).
- **Data URL String:** Base64-encoded string (`data:image/jpeg;base64,...`) passed directly inside the JSON body.

---

## 7. Acceptance Criteria (Definition of Done)

- [ ] Rider can launch camera directly from the active `PICKED_UP` screen.
- [ ] Raw photo is resized and compressed to under 400 KB before upload.
- [ ] Image preview is shown with clear "Retake" and "Accept" options.
- [ ] Photo persists to IndexedDB if captured while offline and uploads upon reconnection.
- [ ] Backend receives and associates the photo URL/blob with the `Delivery` record.
- [ ] Camera resources and canvas memory are freed immediately after capture.




Implements one-handed ergonomics, swipe/one-tap triggers, wake-lock teardown, and fallback PIN verification.    



import React, { useState, useEffect, useRef } from 'react';
import CameraProofModal from '../components/CameraProofModal';
import { queueMutation } from '../services/outboxStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export default function ActiveDeliveryScreen({ delivery, riderId, socket, onDeliveryCompleted }) {
  const [status, setStatus] = useState(delivery.status);
  const [isPhotoModalOpen, setPhotoModalOpen] = useState(false);
  const [podPhoto, setPodPhoto] = useState(null);
  const [pinCode, setPinCode] = useState('');
  const [pinInputOpen, setPinInputOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const wakeLockRef = useRef(null);
  const watchIdRef = useRef(null);

  // Connectivity monitoring
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Screen WakeLock during transit
  useEffect(() => {
    const acquireWakeLock = async () => {
      if ('wakeLock' in navigator && status === 'PICKED_UP') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          // WakeLock request can fail if device battery is low
        }
      }
    };
    acquireWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [status]);

  // Geolocation tracking on PICKED_UP
  useEffect(() => {
    if (status === 'PICKED_UP' && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const payload = {
            deliveryId: delivery.id,
            riderId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: new Date().toISOString(),
          };
          if (socket && socket.connected) {
            socket.emit('rider:location_update', payload);
          }
        },
        (err) => console.warn('GPS Watcher Warning:', err.message),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [status, delivery.id, riderId, socket]);

  // Pickup Confirmation Flow
  const handleConfirmPickup = async () => {
    setIsSubmitting(true);
    const endpoint = `${API_BASE}/deliveries/${delivery.id}/pickup`;
    const payload = { riderId };

    try {
      if (navigator.onLine) {
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-user-id': riderId, 'x-user-role': 'RIDER' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Pickup sync failed');
      } else {
        await queueMutation({ url: endpoint, method: 'PATCH', body: payload });
      }
      setStatus('PICKED_UP');
      if ('vibrate' in navigator) navigator.vibrate(100);
    } catch (err) {
      console.error(err);
      // Optimistic transition fallback
      setStatus('PICKED_UP');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Completion Flow
  const handleFinalCompletion = async () => {
    if (!pinCode || !podPhoto) {
      alert('Please enter the verification PIN and capture a proof photo.');
      return;
    }

    setIsSubmitting(true);
    const endpoint = `${API_BASE}/deliveries/${delivery.id}/verify`;
    const payload = {
      verificationCode: pinCode.trim(),
      proofImage: podPhoto.dataUrl,
    };

    try {
      if (navigator.onLine) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': riderId, 'x-user-role': 'RIDER' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Verification mismatch');
        }
      } else {
        await queueMutation({ url: endpoint, method: 'POST', body: payload });
      }

      // Teardown Hardware & Clean Resources
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (wakeLockRef.current) wakeLockRef.current.release();
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);

      setStatus('DELIVERED');
      onDeliveryCompleted({ ...delivery, status: 'DELIVERED' });
    } catch (err) {
      alert(err.message || 'Verification failed. Check the PIN code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.screen}>
      {/* Offline Status Indicator */}
      {isOffline && (
        <div style={styles.offlineBanner}>
          ⚠️ Offline Mode — Actions will save locally and sync when connected.
        </div>
      )}

      {/* Main Delivery Metadata */}
      <div style={styles.card}>
        <div style={styles.statusRow}>
          <span style={styles.orderId}>Order #{delivery.id.slice(0, 8)}</span>
          <span style={{ ...styles.badge, backgroundColor: status === 'PICKED_UP' ? '#0284c7' : '#f59e0b' }}>
            {status}
          </span>
        </div>

        <div style={styles.addressBlock}>
          <div style={styles.locationNode}>
            <span style={styles.dotPickup}>●</span>
            <div>
              <p style={styles.locationLabel}>PICKUP</p>
              <p style={styles.locationText}>{delivery.pickupAddress}</p>
            </div>
          </div>
          <div style={styles.locationNode}>
            <span style={styles.dotDropoff}>●</span>
            <div>
              <p style={styles.locationLabel}>DROPOFF</p>
              <p style={styles.locationText}>{delivery.dropoffAddress}</p>
            </div>
          </div>
        </div>

        {/* External Map Deep-Links */}
        <div style={styles.navRow}>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${delivery.dropoffLat},${delivery.dropoffLng}`}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.navBtn}
          >
            🗺️ Open Navigation
          </a>
        </div>
      </div>

      {/* Active Dropoff Actions (PICKED_UP State) */}
      {status === 'PICKED_UP' && (
        <div style={styles.verificationSection}>
          <div style={styles.verificationButtons}>
            <button
              onClick={() => setPhotoModalOpen(true)}
              style={{ ...styles.actionTile, borderColor: podPhoto ? '#16a34a' : '#475569' }}
            >
              {podPhoto ? '✓ Photo Captured' : '📷 Take Proof Photo'}
            </button>
            <button
              onClick={() => setPinInputOpen(!pinInputOpen)}
              style={{ ...styles.actionTile, borderColor: pinCode ? '#16a34a' : '#475569' }}
            >
              {pinCode ? `✓ Code: ${pinCode}` : '🔢 Enter PIN Code'}
            </button>
          </div>

          {pinInputOpen && (
            <div style={styles.pinDrawer}>
              <input
                type="text"
                maxLength={8}
                placeholder="Enter Verification PIN"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                style={styles.pinInput}
              />
            </div>
          )}
        </div>
      )}

      {/* Fixed Bottom Ergonomic Action Anchor */}
      <div style={styles.bottomAnchor}>
        {status === 'ASSIGNED' && (
          <button
            onClick={handleConfirmPickup}
            disabled={isSubmitting}
            style={styles.primaryActionButton}
          >
            {isSubmitting ? 'Confirming...' : 'CONFIRM PICKUP'}
          </button>
        )}

        {status === 'PICKED_UP' && (
          <button
            onClick={handleFinalCompletion}
            disabled={isSubmitting || !podPhoto || !pinCode}
            style={{
              ...styles.primaryActionButton,
              backgroundColor: podPhoto && pinCode ? '#16a34a' : '#334155',
              cursor: podPhoto && pinCode ? 'pointer' : 'not-allowed',
            }}
          >
            {isSubmitting ? 'Verifying...' : 'COMPLETE DELIVERY'}
          </button>
        )}
      </div>

      <CameraProofModal
        isOpen={isPhotoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        onPhotoAccepted={(photoData) => setPodPhoto(photoData)}
      />
    </div>
  );
}

const styles = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    padding: '16px 16px 100px 16px',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  offlineBanner: {
    backgroundColor: '#eab308',
    color: '#000',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 'bold',
    marginBottom: '12px',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    border: '1px solid #334155',
  },
  statusRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: '18px', fontWeight: 'bold', color: '#f8fafc' },
  badge: { padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', color: '#fff' },
  addressBlock: { display: 'flex', flexDirection: 'column', gap: '16px' },
  locationNode: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  dotPickup: { color: '#38bdf8', fontSize: '18px' },
  dotDropoff: { color: '#4ade80', fontSize: '18px' },
  locationLabel: { margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' },
  locationText: { margin: 0, fontSize: '15px', color: '#f1f5f9' },
  navRow: { marginTop: '8px' },
  navBtn: {
    display: 'block',
    textAlign: 'center',
    backgroundColor: '#334155',
    color: '#38bdf8',
    textDecoration: 'none',
    padding: '12px',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  verificationSection: { marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  verificationButtons: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  actionTile: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    border: '2px dashed #475569',
    padding: '16px 8px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  pinDrawer: { marginTop: '8px' },
  pinInput: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    textAlign: 'center',
    letterSpacing: '2px',
    boxSizing: 'border-box',
  },
  bottomAnchor: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px',
    backgroundColor: '#0f172a',
    borderTop: '1px solid #1e293b',
  },
  primaryActionButton: {
    width: '100%',
    height: '56px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
  },
};         





