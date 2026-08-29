# REFLEX — Rider Experience & Field Usability Specification

This document outlines the core field-usability principles for the Rider PWA (`apps/mobile`).

## 1. Physical Ergonomics & Thumb-Zone UI
- Bottom-anchor all primary actions (e.g., "Confirm Pickup", "Scan QR") within the bottom 30% of the viewport.
- Maintain minimum touch targets of 48–56px for one-handed operation.
- Implement high-contrast typography readable under direct sunlight.
- Use swipe-to-confirm mechanics for irreversible status transitions.

## 2. Cognitive Load & Context-Aware Views
- Display only the current active delivery and immediate next step.
- Include one-tap deep-link launchers for native GPS navigation apps.
- Provide direct `tel:` links for quick retailer/customer communication.
- Offer an instant manual PIN entry fallback beneath the QR camera viewfinder.

## 3. Intermittent Connectivity & Speed Optimization
- Precache app shell assets via the Service Worker for instant offline loading.
- Apply optimistic UI state updates on pickup and verification events.
- Buffer telemetry and status events in IndexedDB/LocalStorage during network drops.
- Display non-intrusive offline status indicators.

## 4. Hardware Efficiency & Battery Conservation
- Run high-accuracy GPS tracking strictly during the `PICKED_UP` state.
- Throttle coordinate updates when stationary.
- Utilize the Screen Wake Lock API during active transit.
- Compress proof-of-delivery images locally before network upload.

## 5. Multi-Sensory Feedback
- Trigger device vibration feedback on scan success, errors, and assignments.
- Play brief audio chimes for state confirmation without requiring screen focus.






Manages client-side queues for offline mutations and GPS breadcrumbs.

The Code: const DB_NAME = 'reflex_rider_db';
const DB_VERSION = 1;
const STORE_MUTATIONS = 'outbox_mutations';
const STORE_LOCATIONS = 'location_buffer';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_LOCATIONS)) {
        db.createObjectStore(STORE_LOCATIONS, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueMutation(mutation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_MUTATIONS);
    const item = {
      ...mutation,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingMutations() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readonly');
    const store = tx.objectStore(STORE_MUTATIONS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeMutation(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_MUTATIONS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function bufferLocation(locationData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCATIONS, 'readwrite');
    const store = tx.objectStore(STORE_LOCATIONS);
    const req = store.add(locationData);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function flushLocationBuffer() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCATIONS, 'readwrite');
    const store = tx.objectStore(STORE_LOCATIONS);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = req.result || [];
      store.clear();
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}     

