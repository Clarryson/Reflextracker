# 🚚 Reflex Delivery Tracking System — Backend API

A clean, modular REST API backend for Reflex, an MVP delivery tracking system designed for small Kenyan retailers (electronics shops, pharmacies, hardware stores).

---

## Architecture

```
React Web Frontend
        │
        │ HTTP/REST  +  WebSocket (Socket.IO)
        ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js + Express Backend                  │
│                                                         │
│  /api/auth         Authentication & JWT                 │
│  /api/deliveries   Full delivery lifecycle              │
│  /api/riders       Rider management (dispatcher)        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │             Delivery Service                    │   │
│  │         (State Machine + Validation)            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Real-time Module                     │   │
│  │         Socket.IO  +  deliveryEvents            │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────┘
                               │
                               ▼
                        ┌────────────┐
                        │   MySQL    │
                        │  Database  │
                        └────────────┘
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL 8+ |
| DB Driver | mysql2/promise |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Real-time | Socket.IO |
| File upload | Multer |
| Config | dotenv |
| Testing | Jest + supertest |

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INT UNSIGNED PK | Auto-increment |
| name | VARCHAR(120) | |
| email | VARCHAR(255) UNIQUE | |
| phone | VARCHAR(20) | |
| password_hash | VARCHAR(255) | bcrypt |
| role | ENUM | RETAILER, DISPATCHER, RIDER |
| created_at / updated_at | DATETIME | |

### `deliveries`
| Column | Type | Notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| delivery_reference | VARCHAR(20) UNIQUE | DEL-000001 |
| retailer_id | FK → users | |
| rider_id | FK → users NULL | |
| customer_name / phone | VARCHAR | |
| delivery_address | TEXT | |
| item_description | TEXT | |
| status | ENUM | OPEN, ASSIGNED, PICKED_UP, DELIVERED, CANCELLED, FAILED, INCIDENT |
| qr_token | VARCHAR(100) | Secure random token |
| qr_verified | TINYINT(1) | 0 / 1 |
| created_at / updated_at | DATETIME | |
| picked_up_at / delivered_at | DATETIME NULL | |

### `delivery_history` (append-only)
| Column | Type |
|---|---|
| id | INT PK |
| delivery_id | FK |
| changed_by | FK → users |
| previous_status | VARCHAR NULL |
| new_status | VARCHAR |
| notes | TEXT |
| created_at | DATETIME |

### `proof_of_delivery`
| Column | Type |
|---|---|
| id | INT PK |
| delivery_id | FK UNIQUE |
| rider_id | FK |
| file_url | VARCHAR(500) |
| file_type | VARCHAR(50) |
| uploaded_at | DATETIME |

### `incidents`
| Column | Type |
|---|---|
| id | INT PK |
| delivery_id | FK |
| reported_by | FK → users |
| incident_type | ENUM |
| description | TEXT |
| status | ENUM OPEN/RESOLVED |
| created_at / resolved_at | DATETIME |

---

## API Endpoints

### Authentication
| Method | Path | Role | Description |
|---|---|---|---|
| POST | /api/auth/register | Public | Create account |
| POST | /api/auth/login | Public | Login, returns JWT |
| GET | /api/auth/me | Any | Current user profile |

### Deliveries
| Method | Path | Role | Description |
|---|---|---|---|
| POST | /api/deliveries | RETAILER | Create delivery |
| GET | /api/deliveries | Any | List (role-scoped) |
| GET | /api/deliveries/:id | Any | Full detail |
| PATCH | /api/deliveries/:id/assign | DISPATCHER | Assign rider |
| PATCH | /api/deliveries/:id/reassign | DISPATCHER | Change rider |
| POST | /api/deliveries/:id/pickup | RIDER | Confirm pickup |
| POST | /api/deliveries/:id/verify | RIDER | Verify QR code |
| POST | /api/deliveries/:id/proof | RIDER | Upload proof (multipart) |
| POST | /api/deliveries/:id/complete | RIDER | Complete delivery |
| GET | /api/deliveries/:id/history | Any | Status history |
| POST | /api/deliveries/:id/incidents | RIDER/DISPATCHER | Report incident |
| GET | /api/deliveries/:id/incidents | Any | List incidents |

### Riders (Dispatcher only)
| Method | Path | Description |
|---|---|---|
| GET | /api/riders | List all riders |
| GET | /api/riders/:id | Rider detail + active deliveries |

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer <jwt-token>
```

JWT payload:
```json
{ "id": 1, "name": "Kamau", "email": "kamau@electronics.co.ke", "role": "RETAILER" }
```

Expiry is configurable via `JWT_EXPIRES_IN` (default: `7d`).

---

## Delivery Lifecycle

```
           CREATE
              │
           OPEN
              │  DISPATCHER assigns rider
           ASSIGNED
              │  RIDER confirms pickup
           PICKED_UP
              │  RIDER verifies QR  (qr_verified = true)
              │  RIDER uploads proof
              │  RIDER calls /complete
           DELIVERED
```

Possible incident states: `CANCELLED`, `FAILED`, `INCIDENT`  
Terminal states (no further transitions): `DELIVERED`, `CANCELLED`, `FAILED`

---

## QR Verification Flow

1. **Delivery created** → backend generates `qr_token` (format: `REFLEX-DEL-XXXXXX-{32-hex}`)
2. **Frontend** generates a QR image from this token string and displays/prints it with the package
3. **Rider scans** the QR code at delivery
4. **Frontend** sends `POST /api/deliveries/:id/verify` with `{ qrToken }`
5. **Backend** compares the submitted token with the stored token (constant-time comparison)
6. If valid → sets `qr_verified = true` and emits `delivery:verified` event
7. **Required** before calling `/complete`

No sensitive PII is embedded in the QR token.

---

## Proof of Delivery

- Endpoint: `POST /api/deliveries/:id/proof`
- Content-Type: `multipart/form-data`
- Field name: `proof`
- Allowed types: `image/jpeg`, `image/png`, `application/pdf`
- Max size: 5 MB (configurable via `MAX_FILE_SIZE_MB`)
- Files stored in: `uploads/proof/` (gitignored)
- Metadata stored in `proof_of_delivery` table

---

## Live Update Events (Socket.IO)

### Client Connection
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: '<jwt-token>' }
});
```

### Subscribe to a Delivery
```javascript
socket.emit('join:delivery', { deliveryId: 42 });
```

### Events Emitted by Server

All events emit two messages simultaneously:
- `delivery:updated` — unified event with `{ event, deliveryId, timestamp, ...payload }`
- Named event (e.g. `delivery:assigned`) — for fine-grained subscriptions

| Event | When |
|---|---|
| `delivery:created` | Retailer creates delivery |
| `delivery:assigned` | Dispatcher assigns rider |
| `delivery:reassigned` | Dispatcher changes rider |
| `delivery:picked_up` | Rider confirms pickup |
| `delivery:verified` | QR code verified |
| `delivery:proof_uploaded` | Proof of delivery uploaded |
| `delivery:delivered` | Delivery completed |
| `delivery:incident` | Incident reported |

---

## Response Format

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Delivery not found."
}
```

### HTTP Status Codes
| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (validation) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (wrong role / not your delivery) |
| 404 | Not Found |
| 409 | Conflict (invalid state transition) |
| 500 | Internal Server Error |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Server
PORT=5000
NODE_ENV=development

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=reflex_tracker

# Test database
DB_NAME_TEST=reflex_tracker_test

# JWT
JWT_SECRET=at_least_32_random_characters
JWT_EXPIRES_IN=7d

# CORS (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Uploads
UPLOAD_DIR=uploads/proof
MAX_FILE_SIZE_MB=5
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- MySQL 8+
- npm

### Steps

```bash
# 1. Clone and install
git clone <repo>
cd Reflex-tracker
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials and JWT secret

# 3. Create the database
mysql -u root -p -e "CREATE DATABASE reflex_tracker;"
# (For tests)
mysql -u root -p -e "CREATE DATABASE reflex_tracker_test;"

# 4. Run migrations
npm run migrate

# 5. (Optional) Seed demo data
npm run seed

# 6. Start development server
npm run dev
```

Server starts at `http://localhost:5000`.

---

## Running Tests

```bash
# All tests (requires MySQL)
npm test

# Unit tests only (no DB required)
npm run test:unit

# Integration tests only (requires MySQL test DB)
npm run test:int
```

Integration tests automatically use `DB_NAME_TEST` and truncate tables between each suite.

---

## Example API Requests

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kamau Electronics",
    "email": "kamau@electronics.co.ke",
    "phone": "0712345678",
    "password": "Password123!",
    "role": "RETAILER"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "kamau@electronics.co.ke", "password": "Password123!"}'
```

### Create Delivery (Retailer)
```bash
curl -X POST http://localhost:5000/api/deliveries \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "John Kamau",
    "customerPhone": "0712345678",
    "deliveryAddress": "Kilimani, Nairobi",
    "itemDescription": "Samsung Galaxy A15"
  }'
```

### Assign Rider (Dispatcher)
```bash
curl -X PATCH http://localhost:5000/api/deliveries/1/assign \
  -H "Authorization: Bearer <dispatcher-token>" \
  -H "Content-Type: application/json" \
  -d '{"riderId": 4}'
```

### Confirm Pickup (Rider)
```bash
curl -X POST http://localhost:5000/api/deliveries/1/pickup \
  -H "Authorization: Bearer <rider-token>"
```

### Verify QR (Rider)
```bash
curl -X POST http://localhost:5000/api/deliveries/1/verify \
  -H "Authorization: Bearer <rider-token>" \
  -H "Content-Type: application/json" \
  -d '{"qrToken": "REFLEX-DEL-000001-abc123..."}'
```

### Upload Proof (Rider)
```bash
curl -X POST http://localhost:5000/api/deliveries/1/proof \
  -H "Authorization: Bearer <rider-token>" \
  -F "proof=@/path/to/photo.jpg"
```

### Complete Delivery (Rider)
```bash
curl -X POST http://localhost:5000/api/deliveries/1/complete \
  -H "Authorization: Bearer <rider-token>"
```

### Report Incident
```bash
curl -X POST http://localhost:5000/api/deliveries/1/incidents \
  -H "Authorization: Bearer <rider-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "incidentType": "CUSTOMER_UNAVAILABLE",
    "description": "Customer was unavailable at the delivery address."
  }'
```

---

## Known Limitations

- **File storage**: Proof files are stored on the local filesystem (`uploads/proof/`). For production, migrate to cloud storage (AWS S3, Google Cloud Storage).
- **QR reference counter**: The delivery reference generator reads the last DB row. Under very high concurrency a dedicated sequence table would be safer.
- **No refresh tokens**: JWT sessions cannot be revoked until expiry.
- **No pagination**: List endpoints return all matching deliveries.
- **No SMS/push notifications**: Live updates are Socket.IO only.

---

## Future Improvements

- Cloud file storage (S3/GCS)
- Pagination and search on list endpoints
- Refresh token / token revocation
- SMS notifications via Africa's Talking
- Rider availability management
- Incident resolution workflow
- Admin dashboard endpoints
- Rate limiting
- Helmet.js security headers
- Docker Compose setup
