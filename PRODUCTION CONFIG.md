# REFLEX — Production Configuration Guide

> **Issue #59 · Configure the project so it can be safely run outside the development environment.**

This document covers everything required to run REFLEX in a real, non-development environment — including secure environment variable handling, production builds, deployment targets, CORS hardening, and checklist sign-off.

---

## Table of Contents

1. [Why This Matters](#1-why-this-matters)
2. [What Changes Between Dev and Production](#2-what-changes-between-dev-and-production)
3. [Environment Variables — Production Values](#3-environment-variables--production-values)
4. [Building the Apps for Production](#4-building-the-apps-for-production)
5. [Deploying the Proxy Server (Railway / VPS)](#5-deploying-the-proxy-server-railway--vps)
6. [Deploying the Web App (Vercel)](#6-deploying-the-web-app-vercel)
7. [Deploying the Mobile App (Vercel / Static Host)](#7-deploying-the-mobile-app-vercel--static-host)
8. [CORS & Security Hardening](#8-cors--security-hardening)
9. [WebSocket in Production](#9-websocket-in-production)
10. [Pre-Launch Checklist](#10-pre-launch-checklist)
11. [Rollback Plan](#11-rollback-plan)

---

## 1. Why This Matters

In development, REFLEX runs with:
- Open CORS (`Access-Control-Allow-Origin: *`)
- Credentials stored in plain `.env.local` files
- Vite dev server serving the frontend (not production-optimised)
- `node server.js` started manually with no process manager

None of these are acceptable in production. This guide fixes all of them.

---

## 2. What Changes Between Dev and Production

| Concern                  | Development                        | Production                                  |
| ------------------------ | ---------------------------------- | ------------------------------------------- |
| **Frontend serving**     | Vite dev server (HMR, unminified)  | Static build output (`dist/`) via Vercel    |
| **API URLs**             | `http://localhost:3000`            | Actual deployed proxy server URL (HTTPS)    |
| **CORS origin**          | `*` (all origins allowed)          | Locked to your exact deployed domain(s)     |
| **Credentials in env**   | `.env.local` on each machine       | Environment variables set on the host platform |
| **Server process**       | `node server.js` (manual)          | Managed process (Railway, PM2, or similar)  |
| **WebSocket URL**        | `http://localhost:3000`            | `wss://your-server-domain.com` (secure WS)  |
| **Secrets**              | Shared in `.env.example` templates | Secret manager / platform env vars only     |

---

## 3. Environment Variables — Production Values

### 3.1 Proxy Server (hosted on Railway or VPS)

Set these as **platform environment variables** — never in a committed file:

```env
# Railway Backend
RAILWAY_API=https://backend-production-7f0d0.up.railway.app/api

# The public URL where the rider mobile app is deployed
RIDER_PWA_URL=https://reflex-mobile.vercel.app

# Server port (Railway sets this automatically; override only on a VPS)
PORT=3000

# Auth credentials — use real, secure passwords
DISPATCHER_EMAIL=omondi@reflex.co.ke
DISPATCHER_PASSWORD=<STRONG_SECRET>

RETAILER_EMAIL=kamau@electronics.co.ke
RETAILER_PASSWORD=<STRONG_SECRET>

RIDER_EMAIL_BRIAN=brian@rider.co.ke
RIDER_PASSWORD_BRIAN=<STRONG_SECRET>
RIDER_EMAIL_GRACE=grace@rider.co.ke
RIDER_PASSWORD_GRACE=<STRONG_SECRET>
RIDER_EMAIL_JAMES=james@rider.co.ke
RIDER_PASSWORD_JAMES=<STRONG_SECRET>
```

> Never commit real credentials. Use the platform's secrets dashboard (Railway Variables, Vercel Environment Variables, etc.)

---

### 3.2 Web App — `apps/web` (Vercel)

Set these in the Vercel project dashboard under **Settings → Environment Variables**:

```env
# Point to the deployed proxy server, not localhost
VITE_API_BASE_URL=https://reflex-server.up.railway.app/api
VITE_SOCKET_URL=https://reflex-server.up.railway.app

# Auth credentials — set these as Vercel secrets
VITE_DISPATCHER_EMAIL=omondi@reflex.co.ke
VITE_DISPATCHER_PASSWORD=<STRONG_SECRET>
VITE_RETAILER_EMAIL=kamau@electronics.co.ke
VITE_RETAILER_PASSWORD=<STRONG_SECRET>

VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=<STRONG_SECRET>
VITE_RIDER_ID_5_EMAIL=grace@rider.co.ke
VITE_RIDER_ID_5_PASSWORD=<STRONG_SECRET>
VITE_RIDER_ID_6_EMAIL=james@rider.co.ke
VITE_RIDER_ID_6_PASSWORD=<STRONG_SECRET>
```

---

### 3.3 Mobile App — `apps/mobile` (Vercel)

```env
VITE_API_BASE_URL=https://reflex-server.up.railway.app/api
VITE_WS_BASE_URL=https://reflex-server.up.railway.app

VITE_DEFAULT_RIDER_ID=4

VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=<STRONG_SECRET>
VITE_RIDER_ID_5_EMAIL=grace@rider.co.ke
VITE_RIDER_ID_5_PASSWORD=<STRONG_SECRET>
VITE_RIDER_ID_6_EMAIL=james@rider.co.ke
VITE_RIDER_ID_6_PASSWORD=<STRONG_SECRET>
```

---

## 4. Building the Apps for Production

Always run a production build before deploying. This minifies code, tree-shakes unused modules, and bakes in the correct env vars.

### Web App

```bash
cd apps/web
npm run build
# Output: apps/web/dist/
```

### Mobile App

```bash
cd apps/mobile
npm run build
# Output: apps/mobile/dist/
```

### Verify the build locally before deploying

```bash
# Web app
cd apps/web
npm run preview
# Opens at http://localhost:4173 — check all pages load correctly

# Mobile app
cd apps/mobile
npm run preview
# Opens at http://localhost:4174
```

> If anything looks broken in preview, fix it before pushing to production.

---

## 5. Deploying the Proxy Server (Railway / VPS)

The proxy server (`server.js`) must be deployed to a persistent host — it handles Socket.IO WebSocket connections and proxies requests to the Railway backend.

### Option A — Railway (Recommended)

1. Push the project to GitHub (already done)
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select the `Reflextracker` repo
4. Set the **Start Command** to:
   ```
   node server.js
   ```
5. Under **Variables**, add all environment variables from [Section 3.1](#31-proxy-server-hosted-on-railway-or-vps)
6. Railway will assign a public URL (e.g. `https://reflex-server.up.railway.app`)
7. Copy that URL — you will need it for the frontend env vars

### Option B — VPS with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the server with PM2 (auto-restarts on crash)
pm2 start server.js --name reflex-server

# Auto-start on system reboot
pm2 startup
pm2 save
```

---

## 6. Deploying the Web App (Vercel)

The `apps/web` directory has its own `vercel.json` and is ready to deploy.

### Steps

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import from GitHub
2. Set **Root Directory** to `apps/web`
3. Framework preset: **Vite**
4. Add all environment variables from [Section 3.2](#32-web-app--appsweb-vercel)
5. Click **Deploy**

Vercel will give you a URL like `https://reflex-web.vercel.app`.

### Manual deploy via CLI

```bash
npm install -g vercel

cd apps/web
vercel --prod
```

---

## 7. Deploying the Mobile App (Vercel / Static Host)

The `apps/mobile` directory follows the same pattern.

### Steps

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import from GitHub
2. Set **Root Directory** to `apps/mobile`
3. Framework preset: **Vite**
4. Add all environment variables from [Section 3.3](#33-mobile-app--appsmobile-vercel)
5. Click **Deploy**

Vercel will give you a URL like `https://reflex-mobile.vercel.app`.

> Update `RIDER_PWA_URL` in your proxy server environment variables to match this URL.

### Manual deploy via CLI

```bash
cd apps/mobile
vercel --prod
```

---

## 8. CORS & Security Hardening

The current `server.js` has open CORS — this must be tightened before going live.

### Current (insecure — dev only)

```js
// server.js line 13 & 20 — OPEN CORS
const io = new Server(server, { cors: { origin: '*' } });
res.header('Access-Control-Allow-Origin', '*');
```

### Required change for production

Update `server.js` to lock CORS to your actual deployed front-end URLs:

```js
const ALLOWED_ORIGINS = [
  'https://reflex-web.vercel.app',
  'https://reflex-mobile.vercel.app',
  // Add any other domains you control
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
```

### Additional security checklist

- [ ] All traffic over HTTPS (Railway and Vercel enforce this by default)
- [ ] No credentials in source code or committed `.env` files
- [ ] `.env`, `.env.local`, `*.local` all present in `.gitignore` (already configured)
- [ ] Production passwords are strong and unique (not the dev defaults)
- [ ] `node_modules/` and `dist/` are in `.gitignore` (already configured)

---

## 9. WebSocket in Production

Socket.IO works differently in production because browsers require **secure WebSockets (`wss://`)** on HTTPS pages.

- Your proxy server on Railway is served over HTTPS automatically
- The frontend apps must use `https://` (not `http://`) for `VITE_SOCKET_URL` / `VITE_WS_BASE_URL`
- Socket.IO will upgrade `https://` connections to `wss://` automatically — no extra config needed

### Verify WebSocket is working in production

1. Open the deployed Web App URL
2. Open **DevTools → Network → WS tab**
3. You should see a `socket.io` connection to your Railway server URL with status **101 Switching Protocols**

---

## 10. Pre-Launch Checklist

Go through every item below before marking issue #59 as closed.

### Environment

- [ ] All `.env` / `.env.local` files are excluded from git (check `.gitignore`)
- [ ] No hardcoded credentials remain in `server.js` or any app source files
- [ ] All platform environment variables are set on Railway and Vercel dashboards
- [ ] `RIDER_PWA_URL` on the proxy server matches the deployed mobile app URL

### Builds

- [ ] `apps/web` builds successfully (`npm run build` exits with code 0)
- [ ] `apps/mobile` builds successfully (`npm run build` exits with code 0)
- [ ] Both apps pass `npm run preview` locally without errors

### Security

- [ ] CORS `origin: '*'` replaced with specific allowed domains in `server.js`
- [ ] All production passwords are unique and strong (not the dev defaults)
- [ ] HTTPS enforced on all three deployed services

### Functionality

- [ ] Dispatcher can log in and view deliveries on the deployed Web App
- [ ] Retailer can create a delivery on the deployed Web App
- [ ] Rider can log in and view assigned deliveries on the deployed Mobile App
- [ ] Assigning a delivery in the Web App triggers a real-time update in the Mobile App
- [ ] QR scanner works on the deployed Mobile App (HTTPS is required for camera access)

### Proxy Server

- [ ] Proxy server is deployed and publicly reachable
- [ ] `node server.js` starts without errors (check Railway logs)
- [ ] Railway backend (`https://backend-production-7f0d0.up.railway.app`) is responding

---

## 11. Rollback Plan

If something breaks after deploying:

### Frontend (Vercel)

1. Go to the Vercel project dashboard
2. Click **Deployments**
3. Find the last working deployment and click **Promote to Production**

### Proxy Server (Railway)

1. Go to the Railway project dashboard
2. Open the service → **Deployments** tab
3. Click the last working deployment → **Rollback**

### Immediate local fallback

If production is broken and a fix is needed quickly:

```bash
# Run everything locally with production-like env vars
node server.js                    # Terminal 1 (proxy)
cd apps/web    && npm run preview  # Terminal 2 (web, port 4173)
cd apps/mobile && npm run preview  # Terminal 3 (mobile, port 4174)
```

---

## Summary of Deployed URLs (fill in after deployment)

| Service        | Platform | URL                                    |
| -------------- | -------- | -------------------------------------- |
| Proxy Server   | Railway  | `https://________________.railway.app` |
| Web App        | Vercel   | `https://________________.vercel.app`  |
| Mobile App     | Vercel   | `https://________________.vercel.app`  |
| Backend API    | Railway  | `https://backend-production-7f0d0.up.railway.app` |

---

**Last Updated:** September 2026
**Branch:** `59-prepare-reflex-for-real-use`
**Issue:** #59 — Configure the project so it can be safely run outside the development environment
