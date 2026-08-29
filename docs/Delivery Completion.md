# REFLEX — Delivery Completion & Final Action Specification

This document details the mobile workflow, validation gates, and system teardown required for riders to finalize and complete an active delivery in `apps/mobile`.

---

## 1. Pre-Completion Validation Gate

The final completion action must remain disabled or inaccessible until all mandatory dropoff conditions are satisfied.

### Completion Checklist:
1. **Dropoff Proximity / Location:** Rider is at the dropoff destination.
2. **Verification Validated:** Dropoff QR code scanned successfully OR manual 6-digit PIN entered and verified against backend/local cache.
3. **Proof of Delivery (PoD) Captured:** Dropoff photo captured and compressed, or recipient handoff confirmed.
4. **Action Unlocked:** Once checklist items 2 and 3 are marked complete, transition the primary bottom button from disabled/scanning mode into the active **"Complete Delivery"** state.

---

## 2. Final Action UI/UX Mechanics

To prevent accidental submissions while keeping the interaction effortless with one hand in the field:

- **Full-Width Bottom Anchor:** Place the completion trigger across the bottom of the screen (56px height, high-contrast green/primary color).
- **Frictionless Trigger Option:**
  - *Option A (Swipe-to-Complete):* A horizontal slider where the rider swipes left-to-right. This eliminates pocket mis-clicks and accidental double taps.
  - *Option B (Single Tap with Progress Lock):* A prominent button that immediately disables itself upon click, displays an inline micro-spinner, and prevents duplicate submissions.
- **Immediate Sensory Confirmation:**
  - **Haptics:** Fire a distinct success vibration sequence (`[100, 50, 100]`) upon trigger.
  - **Audio:** Play a crisp completion chime.

---

## 3. Hardware & Background Lifecycle Teardown

Completing a delivery must immediately clean up mobile device resources to conserve battery, data, and memory:



┌─────────────────────────────────────────────────────────────┐
│                 Rider Triggers "Complete"                   │
└──────────────────────────────┬──────────────────────────────┘
│
┌───────────────────────┼───────────────────────┐
▼                       ▼                       ▼
┌──────────────┐      ┌─────────────────┐     ┌──────────────────┐
│ Hardware Off │      │ Socket Teardown │     │ Local Storage    │
│ • Clear GPS  │      │ • Leave room:   │     │ • Clear buffer   │
│   watchId    │      │   delivery: │     │ • Set active     │
│ • Release    │      │ • Cease location│     │   delivery = null│
│   WakeLock   │      │   pings         │     │ • Prune outbox   │
└──────────────┘      └─────────────────┘     └──────────────────┘        



1. **Terminate Geolocation Watcher:** Invoke `navigator.geolocation.clearWatch()` to shut down continuous GPS polling.
2. **Release Screen Wake Lock:** Release the `WakeLockSentinel` so the rider’s screen timeout returns to standard device settings.
3. **Leave Delivery WebSocket Room:** Emit `delivery:leave` for `delivery:<deliveryId>` to stop receiving tracking broadcasts.
4. **Local State Reset:** Clear active delivery memory references and wipe any temporary image previews from device memory.

---

## 4. Post-Completion Summary Screen

Rather than snapping abruptly back to a blank map, display a brief summary screen that provides closure and feedback:

- **Visual Confirmation:** Large green checkmark animation with order number.
- **Delivery Metrics:**
  - Total transit duration (from `pickedUpAt` to `deliveredAt`).
  - Dropoff timestamp.
- **Single Return CTA:** A prominent **"Ready for Next Order"** button that clears the screen and returns the rider to the standby/available pool.
- **Auto-Dismiss Timer:** Automatically return to the standby screen after 5 seconds if the rider does not interact with the summary screen.

---

## 5. Offline & Network Fault Tolerance for Finalization

If the final action is triggered in an elevator, basement, or poor coverage area:

1. **Optimistic Local Completion:** Advance the local delivery state to `DELIVERED` immediately. Show a badge stating `"Saved locally — syncing when online"`.
2. **Outbox Persistence:** Save the verification code, photo proof blob/URI, and completion timestamp to the IndexedDB mutation queue.
3. **Immediate Hardware Teardown:** Proceed with turning off GPS and screen locks locally—do not keep the GPS running while waiting for network restoration.
4. **Background Upload:** Flush the completion payload to `POST /api/deliveries/:id/verify` as soon as the browser detects an active network connection.

---

## 6. Acceptance Criteria (Definition of Done)

- [ ] "Complete Delivery" action cannot be triggered without valid QR scan or PIN match and photo capture.
- [ ] Tapping/swiping the completion action immediately halts device GPS watching and releases screen wake lock.
- [ ] Device triggers auditory and haptic feedback on successful completion.
- [ ] Order status updates to `DELIVERED` on the server and sets `deliveredAt`.
- [ ] Post-delivery summary card displays transit time and returns rider to available state.
- [ ] Completion works seamlessly in offline mode and syncs automatically upon reconnection 





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