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