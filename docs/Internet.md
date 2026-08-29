# REFLEX — Offline Resilience & Low-Connectivity Specification

This document details the architectural strategies for maintaining reliable rider operations in `apps/mobile` when network connectivity is slow, intermittent, or completely unavailable.

---

## 1. Caching Tiers & Service Worker Strategy

### Tier 1: Static App Shell (Cache-First)
- **Scope:** HTML entry point, bundled JavaScript (`.js`, `.jsx`), stylesheets, PWA manifest, app icons, and sound assets.
- **Behavior:** Serve directly from cache on boot. The app must render the interactive shell within <1 second without waiting for network requests.
- **Update Cycle:** Update the cache in the background when a new service worker version is detected, prompting the user on next reload.

### Tier 2: Dynamic Delivery State (Network-First with Local Fallback)
- **Scope:** Active delivery details (`/api/deliveries/:id`), pickup/dropoff addresses, customer notes.
- **Behavior:** Attempt a network fetch with a short timeout (e.g., 3 seconds). If the network fails or times out, immediately serve the cached payload from IndexedDB/CacheStorage to avoid blocking the screen.

### Tier 3: Map Tiles & Routing (Stale-While-Revalidate)
- **Scope:** Map view assets and tile layers (if using Leaflet/Mapbox).
- **Behavior:** Serve previously cached map tiles for the active delivery area while fetching updated tiles in the background.

---

## 2. The Client-Side Outbox Pattern (Offline Mutations)

To allow riders to trigger actions (e.g., "Confirm Pickup", "Scan Dropoff") without network access, mutations must use an outbox queue stored in local browser storage (IndexedDB).

### Step-by-Step Flow:
1. **Action Trigger:** Rider presses an action button (e.g., "Confirm Pickup").
2. **Local Write:** Write the intent to an `outbox_mutations` store with a unique idempotency key, timestamp, payload, and retry counter.
3. **Optimistic Local Update:** Immediately update the local delivery state and UI so the rider can proceed to the next step without waiting.
4. **Sync Worker / Event Listener:**
   - If online: Immediately flush the queue to the backend.
   - If offline: Queue remains intact. As soon as the `window` fires the `online` event or the service worker triggers a background sync, flush the queue sequentially in FIFO (First-In, First-Out) order.
5. **Acknowledge & Prune:** Remove the mutation from the outbox only after receiving an explicit 200/201 HTTP response from the server.

---

## 3. Optimistic UI & State Reconciliation

- **Immediate UI Feedback:** Never present full-screen loading spinners when changing delivery status. Advance the status badge (e.g., from `ASSIGNED` to `PICKED_UP`) instantly.
- **Conflict Handling:** If a queued transition fails during synchronization (e.g., dispatcher reassigned the order while the rider was offline):
  - Mark the local state with a sync conflict flag.
  - Surface a non-blocking toast banner explaining the status mismatch.
  - Refresh the local state against the server's authoritative version.
- **Idempotent APIs:** Ensure all backend status transition endpoints accept an `idempotencyKey` or check current status safely to prevent duplicate processing on reconnections.

---

## 4. GPS Telemetry Buffering

During the `PICKED_UP` phase, network drops should not result in lost location breadcrumbs.

- **Local Breadcrumb Buffer:** When geolocation coordinates are collected while offline, push them into a local telemetry array (`location_buffer`).
- **Batch Dispatch:** When network connectivity is re-established, send buffered points as a batch array to a dedicated endpoint (e.g., `POST /api/deliveries/:id/locations/batch`) instead of firing dozens of individual socket pings simultaneously.
- **Buffer Limits:** Cap the local coordinate buffer (e.g., latest 50 points) to prevent excessive memory usage during extended offline periods.

---

## 5. Network State Awareness & Visual UX

- **Subtle Connection Status:** Display a discreet status bar at the top of the interface:
  - *Online:* Hidden or neutral green dot.
  - *Slow / High Latency:* Amber indicator with "Slow connection — actions will sync automatically".
  - *Offline:* Slate/gray banner with "Offline mode active — work will save locally".
- **Pending Sync Counter:** When items exist in the outbox queue, show a small badge (e.g., "2 actions pending sync") so the rider knows their work is safely recorded locally.
- **Never Block Critical Work:** Never disable the QR scanner, camera capture, or pickup buttons due to lack of an internet connection.

---

## 6. Acceptance Criteria (Definition of Done)

- [ ] App launches into the active delivery screen in Airplane Mode.
- [ ] Rider can confirm pickup while disconnected; UI advances to `PICKED_UP`.
- [ ] Rider can complete delivery via QR code or manual PIN while disconnected.
- [ ] All offline actions sync to the server in correct order when internet is restored.
- [ ] Location points collected during a connection drop are uploaded upon reconnection.
- [ ] Offline indicator displays correctly without blocking user interaction.     



Compresses camera photos on an off-screen HTML canvas to <400 KB before upload or caching. 


The Code: /**
 * Compresses an image file to JPEG under specified dimensions and quality.
 * @param {File} file - Raw image file from camera input
 * @param {number} maxWidth - Maximum bounding width (default 1280px)
 * @param {number} quality - JPEG compression quality (0.0 to 1.0)
 * @returns {Promise<{ blob: Blob, dataUrl: string }>}
 */
export function compressImage(file, maxWidth = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Watermark with timestamp snippet
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, height - 30, width, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(`REFLEX PoD • ${new Date().toISOString()}`, 10, height - 10);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = (err) => reject(err);
    };

    reader.onerror = (err) => reject(err);
  });
}       


