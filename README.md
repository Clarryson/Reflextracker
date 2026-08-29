# 🚚 Reflex Delivery Tracking System — Backend API & Real-Time Engine

> A modular, production-ready REST API & Real-Time WebSocket backend for the Reflex Delivery Tracking System, designed for urban logistics and retail deliveries in Kenya.

[![Live on Railway](https://img.shields.io/badge/Railway-Live%20Backend-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://backend-production-7f0d0.up.railway.app)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io)

---

## 🌐 Live Production Backend

- **Live Base API URL**: `https://backend-production-7f0d0.up.railway.app`
- **Health Check**: [`https://backend-production-7f0d0.up.railway.app/health`](https://backend-production-7f0d0.up.railway.app/health)
- **Frontend Integration Guide**: See [`FRONTEND_INTEGRATION_GUIDE.md`](./FRONTEND_INTEGRATION_GUIDE.md) for quick-start connection instructions, contracts, and Socket.IO listeners.

---

## 🏗️ System Architecture

```text
  ┌────────────────────────┐         ┌────────────────────────┐
  │   Retailer / Dispatcher│         │       Rider PWA        │
  │     Web Application    │         │  (QR Scanner & Proof)  │
  └───────────┬────────────┘         └───────────┬────────────┘
              │                                  │
              │  HTTP/REST (JSON & Multipart)    │
              │  + WebSocket (Socket.IO Events)  │
              ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Railway Cloud Infrastructure                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │               Node.js + Express REST API Server            │  │
│  │                                                            │  │
│  │  /api/auth         Authentication, RBAC & JWT Middleware   │  │
│  │  /api/deliveries   Full Delivery Lifecycle & QR Verify     │  │
│  │  /api/riders       Rider Management & Assignment           │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │                 Delivery State Machine               │  │  │
│  │  │      OPEN ➔ ASSIGNED ➔ PICKED_UP ➔ DELIVERED        │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │                 Real-Time Event Engine               │  │  │
│  │  │       Socket.IO Broadcasts (delivery:updated)        │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│                  ┌─────────────────────────────┐                 │
│                  │        MySQL 8.0 Cloud      │                 │
│                  │  (Managed Database Cluster) │                 │
│                  └─────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Technology Stack

| Layer / Domain | Technology | Description & Capabilities |
|---|---|---|
| **Runtime** | **Node.js (v18+)** | High-performance asynchronous JavaScript engine |
| **Framework** | **Express.js (4.x)** | Clean, modular MVC-style REST API routing and middleware architecture |
| **Cloud Hosting** | **Railway Cloud** | Automated serverless continuous deployments with zero-downtime rollouts |
| **Database** | **MySQL 8.0 (Railway)** | ACID-compliant relational DB with connection pooling & TCP proxy fallback |
| **Database Driver** | **`mysql2/promise`** | Promise-based driver utilizing prepared statements to eliminate SQL injection |
| **Real-Time Engine** | **Socket.IO (4.x)** | Bi-directional, low-latency WebSocket communication for live status feeds |
| **Authentication** | **JWT + bcrypt** | Stateless JSON Web Tokens with encrypted password hashing and RBAC middleware |
| **File Storage** | **Multer** | Multipart/form-data processor for photographic proof-of-delivery uploads |
| **Testing Suite** | **Jest + Supertest** | Automated unit tests and full-flow end-to-end integration test suites |
| **Dev Tooling** | **Dotenv & Nodemon** | Environment configuration management and live-reloading dev workflow |
| **Mobile Access** | **LocalTunnel** | Automatic secure tunnel provisioning for camera testing on physical phones |

---

## 📦 Database Schema Overview

```text
┌──────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│    users     │1     *│   deliveries    │1     1│  proof_of_delivery   │
├──────────────┤───────├─────────────────┤───────├──────────────────────┤
│ id (PK)      │       │ id (PK)         │       │ id (PK)              │
│ name         │       │ reference (UNIQ)│       │ delivery_id (FK UNIQ)│
│ email (UNIQ) │       │ retailer_id (FK)│       │ rider_id (FK)        │
│ phone        │       │ rider_id (FK)   │       │ file_url             │
│ password_hash│       │ status          │       │ file_type            │
│ role         │       │ qr_token        │       │ uploaded_at          │
└──────────────┘       │ qr_verified     │       └──────────────────────┘
                       │ customer_name   │
                       │ delivery_address│       ┌──────────────────────┐
                       │ item_description│1     *│   delivery_history   │
                       └────────┬────────┘───────├──────────────────────┤
                                │                │ id (PK)              │
                                │1              *│ delivery_id (FK)     │
                                └────────────────┤ changed_by (FK)      │
                                                 │ previous_status      │
                                                 │ new_status           │
                                                 │ notes                │
                                                 │ created_at           │
                                                 └──────────────────────┘
```

### Supported Roles & Permissions
- **`RETAILER`**: Creates new deliveries, tracks own store orders, accesses QR codes for package labeling.
- **`DISPATCHER`**: Views all platform deliveries, queries rider availability, assigns/reassigns riders.
- **`RIDER`**: Confirms package pickup, scans customer QR tokens, uploads proof-of-delivery photos, completes orders.

---

## 🚀 Delivery State Machine

```text
      ┌──────────┐
      │   OPEN   │ ─── Retailer registers order
      └────┬─────┘
           │ DISPATCHER: PATCH /api/deliveries/:id/assign
           ▼
     ┌───────────┐
     │  ASSIGNED │ ─── Rider allocated to package
     └─────┬─────┘
           │ RIDER: POST /api/deliveries/:id/pickup
           ▼
    ┌─────────────┐
    │  PICKED_UP  │ ─── Package in transit
    └──────┬──────┘
           │ 1. RIDER: POST /api/deliveries/:id/verify  (QR Scan)
           │ 2. RIDER: POST /api/deliveries/:id/proof   (Photo Upload)
           │ 3. RIDER: POST /api/deliveries/:id/complete
           ▼
    ┌─────────────┐
    │  DELIVERED  │ ─── Terminal State (Completed)
    └─────────────┘
```

*Alternative / Exceptional States:* `CANCELLED`, `FAILED`, `INCIDENT`

---

## 📡 API Endpoints Reference

### 1. Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create new retailer or rider account |
| `POST` | `/api/auth/login` | Public | Authenticate user & return JWT token |
| `GET` | `/api/auth/me` | Bearer | Retrieve authenticated profile |

### 2. Deliveries Management (`/api/deliveries`)
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `POST` | `/api/deliveries` | `RETAILER` | Create a new delivery order |
| `GET` | `/api/deliveries` | `RETAILER`, `DISPATCHER`, `RIDER` | List deliveries (role-scoped filter) |
| `GET` | `/api/deliveries/:id` | All Roles | Retrieve full delivery details & history |
| `PATCH` | `/api/deliveries/:id/assign` | `DISPATCHER` | Assign rider to open delivery |
| `PATCH` | `/api/deliveries/:id/reassign` | `DISPATCHER` | Change assigned rider |
| `POST` | `/api/deliveries/:id/pickup` | `RIDER` | Confirm pickup from retailer |
| `POST` | `/api/deliveries/:id/verify` | `RIDER` | Verify delivery QR code token |
| `POST` | `/api/deliveries/:id/proof` | `RIDER` | Upload multipart proof photo (`proof` field) |
| `POST` | `/api/deliveries/:id/complete` | `RIDER` | Mark delivery as completed |
| `GET` | `/api/deliveries/:id/history` | All Roles | Fetch audit trail of status changes |
| `POST` | `/api/deliveries/:id/incidents`| `RIDER`, `DISPATCHER` | Log transit issue / incident |

### 3. Rider Management (`/api/riders`)
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/riders` | `DISPATCHER` | List all active riders |
| `GET` | `/api/riders/:id` | `DISPATCHER` | Get rider details and active queue |

---

## ⚡ Real-Time Socket.IO Integration

Connect to the live WebSocket server:

```javascript
import { io } from 'socket.io-client';

const socket = io('https://backend-production-7f0d0.up.railway.app', {
  auth: { token: localStorage.getItem('jwt_token') }
});

// Real-time delivery status updates
socket.on('delivery:updated', (data) => {
  console.log('Live status update:', data);
  // data: { event: 'delivery:picked_up', deliveryId: 12, status: 'PICKED_UP', timestamp: '...' }
});
```

---

## 🔐 Seeded Demo Accounts (for Testing)

| Role | Email | Password | Details |
|---|---|---|---|
| **Retailer** | `kamau@electronics.co.ke` | `Password123!` | Kamau Electronics (Nairobi CBD) |
| **Retailer** | `aisha@pharma.co.ke` | `Password123!` | Aisha Pharma Store |
| **Dispatcher** | `omondi@reflex.co.ke` | `Password123!` | Reflex Central Logistics Hub |
| **Rider** | `brian@rider.co.ke` | `Password123!` | Rider Unit 1 (Motorcycle) |
| **Rider** | `grace@rider.co.ke` | `Password123!` | Rider Unit 2 (Bicycle) |

---

## 🛠️ Local Development & Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MySQL**: v8.0 or higher (or Railway Cloud MySQL instance)

### Installation Steps

```bash
# 1. Clone the repository
git clone git@github.com:Clarryson/Reflextracker.git
cd Reflextracker

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env

# 4. Initialize Database Schema & Seed Data
mysql -u root -p < schema.sql
mysql -u root -p < seed.sql

# 5. Start Development Server
npm run dev
```

### Running Automated Tests

```bash
# Run complete test suite (Unit + E2E)
npm test

# Run unit tests only (no database required)
npm run test:unit
```

---

## 📄 License
This project is licensed under the **MIT License**.
