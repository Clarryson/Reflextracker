# REFLEX — Rider App Backend Integration Specification.

This document details the contract, data pipelines, and integration procedures required to connect `apps/mobile` with the REFLEX backend (`server/`) so that all rider interactions and telemetry are reliably persisted.

---

## 1. Client Configuration & Actor Identification

Because authentication is out of scope for the MVP, the mobile app identifies the rider using explicit headers and environment-driven base paths.

### Environment Setup (`apps/mobile/.env`):
- `VITE_API_BASE_URL`: Base REST API endpoint (e.g., `http://localhost:4000/api` or LAN IP for physical device testing).
- `VITE_WS_BASE_URL`: WebSocket server origin (e.g., `http://localhost:4000`).

### Request Interceptor & Standard Headers:
Every outbound HTTP request initiated by the Rider PWA must include:
- `Content-Type`: `application/json` (or `multipart/form-data` for file uploads).
- `x-user-id`: The active rider's UUID.
- `x-user-role`: `RIDER`.

---

## 2. REST Endpoint Integration Matrix

| Action | HTTP Route | Method | Payload / Headers | Backend Persistence Target |
| :--- | :--- | :--- | :--- | :--- |
| **Fetch Assigned Jobs** | `/api/deliveries` | `GET` | Query params: `?riderId=:id&status=ASSIGNED,PICKED_UP` | Reads `Delivery` records where `riderId` matches. |
| **Get Order Details** | `/api/deliveries/:id` | `GET` | Params: `id` (Delivery UUID) | Reads single `Delivery` record including retailer info. |
| **Confirm Pickup** | `/api/deliveries/:id/pickup` | `PATCH` | Body: `{ riderId }` | Updates `status = 'PICKED_UP'`, sets `pickedUpAt = NOW()`. |
| **Verify & Complete** | `/api/deliveries/:id/verify` | `POST` | Body: `{ verificationCode, proofImage }` | Validates code, sets `status = 'DELIVERED'`, saves `proofOfDelivery`, sets `deliveredAt = NOW()`. |
| **Batch Location Sync** | `/api/deliveries/:id/locations` | `POST` | Body: `{ locations: [{ lat, lng, recordedAt }] }` | Bulk inserts into `LocationLog` table. |

---

## 3. Real-Time Telemetry & Socket Data Pipeline

Rider location tracking feeds into real-time dispatcher dashboards and creates permanent audit breadcrumbs in the database.

```text
┌─────────────────┐       Socket.io Event: "rider:location_update"       ┌─────────────────┐
│  Rider PWA      │ ───────────────────────────────────────────────────► │  REFLEX Server   │
│  (Geolocation)  │                                                      │  (Express + WS)  │
└─────────────────┘                                                      └────────┬────────┘
																											 │
																		  ┌─────────────────────────┴────────┐
																		  ▼                                  ▼
															┌────────────────────┐             ┌────────────────────┐
															│  Prisma Database   │             │  Dispatcher Room   │
															│  (LocationLog)     │             │  ("dispatchers")   │
															└────────────────────┘             └────────────────────┘
```

### Telemetry Pipeline Rules:
1. **Active Transmission Window:** Transmit coordinate pings only when `status === 'PICKED_UP'`.
2. **Payload Structure:** Each emitted socket packet must include `deliveryId`, `riderId`, `latitude`, `longitude`, and `timestamp`.
3. **Server Ingestion:** The server immediately broadcasts the ping to room `delivery:<deliveryId>` for live tracking, while buffering or directly inserting into the `LocationLog` table.

---

## 4. Verification & Proof of Delivery (PoD) Submission

The completion step closes the delivery lifecycle and requires strict verification.

### Verification Flow:
1. **Capture:** Rider scans customer QR code (or inputs manual text PIN) and captures a dropoff confirmation photo.
2. **Local Pre-Processing:**
	- Compress the captured image in the browser to reduce payload size (<500 KB).
	- Convert image to a secure upload format (multipart form-data or base64 data URL).
3. **Dispatch to Verification Route:** Send payload to `POST /api/deliveries/:id/verify`.
4. **Backend Validation:**
	- Backend compares `verificationCode` against the database record.
	- If matching: Advances status to `DELIVERED`, stores the photo path, and terminates the active tracking session.
	- If mismatch (400 Bad Request): Returns error message; UI displays alert and allows the rider to retry.

---

## 5. Error Handling, Network Faults & Conflict Resolution

- **Idempotent Transitions:** If a network timeout occurs while clicking "Confirm Pickup", the mobile client can safely retry without triggering duplicate state side-effects.
- **HTTP 409 (Conflict):** Occurs if the order was reassigned or cancelled by dispatch while the rider was performing an action. The app must intercept 409 responses, display an alert explaining the change, and refresh the local view.
- **Failed Proof Submissions:** If the photo proof upload fails due to weak cellular upload bandwidth, store the raw code and photo locally and surface a "Retry Upload" banner.

---

## 6. Acceptance Criteria (Definition of Done)

- [ ] App successfully fetches and renders active delivery data assigned to the rider ID.
- [ ] Tapping "Confirm Pickup" updates the database status to `PICKED_UP` and sets `pickedUpAt`.
- [ ] GPS coordinates during transit persist to the `LocationLog` table via WebSockets or batch REST calls.
- [ ] Scanning the correct QR code transitions the delivery to `DELIVERED` and persists `proofOfDelivery`.
- [ ] Incorrect verification codes return appropriate error messages without resetting the app state.
- [ ] All network calls fail gracefully with clear feedback when the server is unreachable.





Uses direct device camera integration with instant image compression.     



import React, { useState, useRef } from 'react';
import { compressImage } from '../utils/imageCompressor';

export default function CameraProofModal({ isOpen, onClose, onPhotoAccepted }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const { blob, dataUrl } = await compressImage(file, 1280, 0.75);
      setCompressedBlob(blob);
      setPreviewUrl(dataUrl);
    } catch (err) {
      console.error('Image compression error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setCompressedBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirm = () => {
    if (compressedBlob && previewUrl) {
      onPhotoAccepted({ blob: compressedBlob, dataUrl: previewUrl });
      onClose();
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        <h3 style={styles.title}>Proof of Delivery Photo</h3>

        {!previewUrl ? (
          <div style={styles.uploadArea}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleCapture}
              style={{ display: 'none' }}
              id="camera-input"
            />
            <label htmlFor="camera-input" style={styles.cameraTriggerBtn}>
              {isProcessing ? 'Processing Image...' : '📷 Open Camera'}
            </label>
          </div>
        ) : (
          <div style={styles.previewContainer}>
            <img src={previewUrl} alt="Dropoff Proof" style={styles.previewImage} />
            <div style={styles.btnRow}>
              <button onClick={handleRetake} style={styles.retakeBtn}>
                Retake
              </button>
              <button onClick={handleConfirm} style={styles.acceptBtn}>
                Accept Photo
              </button>
            </div>
          </div>
        )}

        <button onClick={onClose} style={styles.cancelBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalCard: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxWidth: '480px',
    borderTopLeftRadius: '20px',
    borderTopRightRadius: '20px',
    padding: '24px 16px',
    boxSizing: 'border-box',
    color: '#f8fafc',
  },
  title: { margin: '0 0 16px 0', fontSize: '18px', textAlign: 'center' },
  uploadArea: { display: 'flex', justifyContent: 'center', margin: '20px 0' },
  cameraTriggerBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    padding: '16px 24px',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
    display: 'block',
  },
  previewContainer: { display: 'flex', flexDirection: 'column', gap: '12px' },
  previewImage: { width: '100%', maxHeight: '300px', objectFit: 'cover', borderRadius: '8px' },
  btnRow: { display: 'flex', gap: '12px', marginTop: '8px' },
  retakeBtn: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#475569',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  acceptBtn: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  cancelBtn: {
    width: '100%',
    marginTop: '16px',
    padding: '12px',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '14px',
    cursor: 'pointer',
  },
};     
