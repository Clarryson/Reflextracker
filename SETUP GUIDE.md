# 🚀 REFLEX — Team Setup Guide

> **Issue #56 · Prepare REFLEX so the entire team can start and run the project consistently.**

This document is the single source of truth for every team member to clone, configure, and run the REFLEX platform locally — from a fresh machine to a fully running dev environment.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture at a Glance](#2-architecture-at-a-glance)
3. [Prerequisites](#3-prerequisites)
4. [Repository Setup](#4-repository-setup)
5. [Environment Variables](#5-environment-variables)
6. [Installing Dependencies](#6-installing-dependencies)
7. [Running the Project](#7-running-the-project)
8. [Verify Everything Works](#8-verify-everything-works)
9. [Team Roles & Access URLs](#9-team-roles--access-urls)
10. [Branching & Git Workflow](#10-branching--git-workflow)
11. [Troubleshooting](#11-troubleshooting)
12. [Getting Help](#12-getting-help)

---

## 1. Project Overview

**REFLEX** is a real-time delivery tracking and management platform that connects three user types:

| Role           | Responsibility                                                        |
| -------------- | --------------------------------------------------------------------- |
| **Retailer**   | Creates deliveries, tracks delivery status                           |
| **Dispatcher** | Assigns riders, monitors progress, reassigns as needed               |
| **Rider**      | Views assigned deliveries, confirms pickup, scans QR, submits proof  |

### Delivery Lifecycle

```
OPEN → ASSIGNED → PICKED_UP → DELIVERED
```

---

## 2. Architecture at a Glance

```
Reflextracker/
├── apps/
│   ├── mobile/          ← Rider app (React + Vite, port 5173)
│   └── web/             ← Dispatcher & Retailer app (React + Vite, port 5174)
├── docs/                ← API schemas and feature docs
├── server.js            ← Local proxy server (Node/Express, port 3000)
├── .env.example         ← Root env template
├── vercel.json          ← Vercel deployment config
└── package.json         ← Root dependencies
```

**Backend:** Hosted on Railway → `https://backend-production-7f0d0.up.railway.app`
**Real-time:** Socket.IO (WebSocket) for live delivery updates
**Frontend:** React 19 with Vite

---

## 3. Prerequisites

Make sure the following are installed on your machine **before** proceeding.

| Tool        | Minimum Version | Check Command         | Download                                    |
| ----------- | --------------- | --------------------- | ------------------------------------------- |
| **Node.js** | v18+            | `node --version`      | https://nodejs.org                          |
| **npm**     | v9+             | `npm --version`       | Comes with Node.js                          |
| **Git**     | v2.30+          | `git --version`       | https://git-scm.com                         |
| **Chrome**  | Latest          | —                     | Required for QR scanner & camera features   |

> **Windows users:** Use **PowerShell** or **Git Bash** for all commands in this guide.

---

## 4. Repository Setup

### 4.1 Clone the repository

```bash
git clone https://github.com/Clarryson/Reflextracker.git
cd Reflextracker
```

### 4.2 Checkout the correct branch

```bash
git fetch origin
git checkout 56-package-reflex-for-easy-setup
```

---

## 5. Environment Variables

REFLEX uses `.env` files to store credentials and API endpoints. **These files are never committed to git.** You must create them manually from the provided `.env.example` templates.

### 5.1 Root server `.env`

```bash
# From the project root
cp .env.example .env
```

Open `.env` and fill in the actual credentials (get these from your team lead):

```env
# Railway Backend API
RAILWAY_API=https://backend-production-7f0d0.up.railway.app/api

# Server Port
PORT=3000

# Dispatcher Account
DISPATCHER_EMAIL=omondi@reflex.co.ke
DISPATCHER_PASSWORD=<ask_team_lead>

# Retailer Account
RETAILER_EMAIL=kamau@electronics.co.ke
RETAILER_PASSWORD=<ask_team_lead>

# Rider Accounts
RIDER_EMAIL_BRIAN=brian@rider.co.ke
RIDER_PASSWORD_BRIAN=<ask_team_lead>
RIDER_EMAIL_GRACE=grace@rider.co.ke
RIDER_PASSWORD_GRACE=<ask_team_lead>
RIDER_EMAIL_JAMES=james@rider.co.ke
RIDER_PASSWORD_JAMES=<ask_team_lead>
```

### 5.2 Mobile app `.env.local`

```bash
cd apps/mobile
cp .env.example .env.local
```

Edit `apps/mobile/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_BASE_URL=http://localhost:3000

VITE_DEFAULT_RIDER_ID=4

VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=<ask_team_lead>
VITE_RIDER_ID_5_EMAIL=grace@rider.co.ke
VITE_RIDER_ID_5_PASSWORD=<ask_team_lead>
VITE_RIDER_ID_6_EMAIL=james@rider.co.ke
VITE_RIDER_ID_6_PASSWORD=<ask_team_lead>
```

### 5.3 Web app `.env.local`

```bash
cd apps/web
cp .env.example .env.local
```

Edit `apps/web/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000

VITE_DISPATCHER_EMAIL=omondi@reflex.co.ke
VITE_DISPATCHER_PASSWORD=<ask_team_lead>
VITE_RETAILER_EMAIL=kamau@electronics.co.ke
VITE_RETAILER_PASSWORD=<ask_team_lead>

VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=<ask_team_lead>
VITE_RIDER_ID_5_EMAIL=grace@rider.co.ke
VITE_RIDER_ID_5_PASSWORD=<ask_team_lead>
VITE_RIDER_ID_6_EMAIL=james@rider.co.ke
VITE_RIDER_ID_6_PASSWORD=<ask_team_lead>
```

> Never commit `.env` or `.env.local` files — they are already listed in `.gitignore`.

---

## 6. Installing Dependencies

Run `npm install` in **three** places — root, mobile, and web.

```bash
# 1. Root (installs proxy server dependencies)
npm install

# 2. Mobile app
cd apps/mobile
npm install

# 3. Web app
cd ../web
npm install
```

---

## 7. Running the Project

You need **three terminals** running simultaneously.

### Terminal 1 — Proxy Server

```bash
# From the project root
node server.js
```

Expected output:
```
Reflex live proxy server running on http://localhost:3000
Linked to Railway: https://backend-production-7f0d0.up.railway.app/api
```

### Terminal 2 — Mobile App (Rider)

```bash
cd apps/mobile
npm run dev
```

Open → **http://localhost:5173**

### Terminal 3 — Web App (Dispatcher / Retailer)

```bash
cd apps/web
npm run dev
```

Open → **http://localhost:5174**

---

## 8. Verify Everything Works

### Backend connectivity

```bash
curl https://backend-production-7f0d0.up.railway.app/api/deliveries
# Should return a JSON array (not an error)
```

### Web App — Dispatcher view

1. Open http://localhost:5174
2. Log in as Dispatcher
3. You should see a list of deliveries
4. Try assigning a rider to an open delivery

### Mobile App — Rider view

1. Open http://localhost:5173
2. You should see deliveries assigned to Brian (Rider ID 4)
3. Click a delivery → verify details page loads
4. Check geolocation permission prompt appears

### Real-time updates

1. With both apps open, assign a delivery in the Web App
2. Within 1–2 seconds, the Mobile App should reflect the change without refreshing

### QR Scanner

1. In the Mobile App, open an active delivery
2. Click **"Verify PIN / QR"**
3. Allow camera permission when prompted
4. Camera feed should appear (use Chrome for best compatibility)

---

## 9. Team Roles & Access URLs

| Role           | App        | Local URL                  | Env credentials     |
| -------------- | ---------- | -------------------------- | ------------------- |
| **Dispatcher** | Web App    | http://localhost:5174      | `VITE_DISPATCHER_*` |
| **Retailer**   | Web App    | http://localhost:5174      | `VITE_RETAILER_*`   |
| **Rider**      | Mobile App | http://localhost:5173      | `VITE_RIDER_ID_4_*` |

---

## 10. Branching & Git Workflow

```
main              ← stable, production-ready
├── feature/      ← new features (e.g. 56-package-reflex-for-easy-setup)
├── fix/          ← bug fixes
└── chore/        ← maintenance (deps, docs, config)
```

### Starting a new task

```bash
git checkout main
git pull origin main
git checkout -b <issue-number>-short-description
```

### Commit message conventions

| Prefix       | When to use                              |
| ------------ | ---------------------------------------- |
| `feat:`      | New feature or functionality             |
| `fix:`       | Bug fix                                  |
| `chore:`     | Config, deps, tooling, docs              |
| `refactor:`  | Code change with no functional impact    |

---

## 11. Troubleshooting

### `ECONNREFUSED` — server not reachable

```bash
# Make sure Terminal 1 (proxy server) is running
node server.js

# Test Railway is online
curl https://backend-production-7f0d0.up.railway.app/api/deliveries
```

### `Cannot find module` — missing dependencies

```bash
# Windows PowerShell — clean reinstall
Remove-Item -Recurse -Force node_modules
npm install
```

### Port already in use (3000 / 5173 / 5174)

```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Camera / QR scanner not working

- Use **Google Chrome**
- Ensure localhost camera permission is allowed in Chrome settings
- On a mobile device, use the device's local IP (e.g. `http://192.168.x.x:5173`)

### Real-time updates not appearing

- Confirm proxy server is running (Terminal 1)
- Check **DevTools → Network → WS tab** for a `socket.io` connection
- Verify `VITE_WS_BASE_URL` / `VITE_SOCKET_URL` both point to `http://localhost:3000`

### `.env` not being picked up

- Vite reads `.env.local` (inside `apps/`) and `.env` (in root)
- **Restart the dev server** after any `.env` change — hot reload does NOT apply to env vars

---

## 12. Getting Help

1. **`docs/`** — [`RAILWAY_API_SCHEMA.md`](./docs/RAILWAY_API_SCHEMA.md) has all API contracts
2. **Browser console** — most runtime errors appear there first
3. **Server logs** — Terminal 1 logs all API requests and errors
4. **GitHub Issues** — tag with `bug`, `question`, or `setup`
5. **Team lead** — for Railway credentials or backend access

---

## Quick Reference Card

```bash
# --- One-time setup ---
git clone https://github.com/Clarryson/Reflextracker.git && cd Reflextracker
git fetch origin && git checkout 56-package-reflex-for-easy-setup

cp .env.example .env                                 # fill in credentials
cd apps/mobile && cp .env.example .env.local         # fill in credentials
cd ../web    && cp .env.example .env.local           # fill in credentials

cd ../..  && npm install
cd apps/mobile && npm install
cd ../web && npm install

# --- Every time you work (3 terminals) ---
# Terminal 1 → node server.js            (proxy,  port 3000)
# Terminal 2 → cd apps/mobile && npm run dev  (rider,  port 5173)
# Terminal 3 → cd apps/web    && npm run dev  (web,    port 5174)
```

---

**Last Updated:** September 2026
**Branch:** `56-package-reflex-for-easy-setup`
**Issue:** #56 — Package REFLEX for easy setup
