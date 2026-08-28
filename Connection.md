# REFLEX — Rider App Backend Integration Specification

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