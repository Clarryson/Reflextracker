# REFLEX System - Setup Instructions

## Overview

This guide walks you through setting up the REFLEX delivery management system for local development and testing.

## Prerequisites

- Node.js v24+ (check with `node --version`)
- npm v10+ (check with `npm --version`)
- Access to Railway backend at `https://backend-production-7f0d0.up.railway.app`
- Valid test credentials from the Railway database administrator

## Step 1: Clone and Install Dependencies

### Root Setup
```bash
cd "c:\Users\Work\Relflex tracker 1\Reflextracker"
npm install
```

### Mobile App
```bash
cd apps/mobile
npm install
```

### Web App
```bash
cd apps/web
npm install
```

## Step 2: Configure Environment Variables

Each application requires a `.env.local` file with credentials and API endpoints.

### Root Server (.env)

Create `.env` file in the root directory:

```bash
# Copy from template
cp .env.example .env
```

Edit `.env` with your actual credentials:

```env
# Railway Backend API
RAILWAY_API=https://backend-production-7f0d0.up.railway.app/api

# Server Port
PORT=3000

# Dispatcher Account Credentials
DISPATCHER_EMAIL=omondi@reflex.co.ke
DISPATCHER_PASSWORD=your_secure_dispatcher_password

# Retailer Account Credentials
RETAILER_EMAIL=kamau@electronics.co.ke
RETAILER_PASSWORD=your_secure_retailer_password

# Rider Account Credentials
RIDER_EMAIL_BRIAN=brian@rider.co.ke
RIDER_PASSWORD_BRIAN=your_secure_brian_password
RIDER_EMAIL_GRACE=grace@rider.co.ke
RIDER_PASSWORD_GRACE=your_secure_grace_password
RIDER_EMAIL_JAMES=james@rider.co.ke
RIDER_PASSWORD_JAMES=your_secure_james_password
```

⚠️ **IMPORTANT:** Keep these credentials secure. Never commit `.env` to git.

### Mobile App (.env.local)

```bash
cd apps/mobile
cp .env.example .env.local
```

Edit `apps/mobile/.env.local`:

```env
# Local development
VITE_API_BASE_URL=http://localhost:4000/api
VITE_WS_BASE_URL=http://localhost:4000

# Default rider (4=Brian, 5=Grace, 6=James)
VITE_DEFAULT_RIDER_ID=4

# Rider Credentials
VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=your_secure_brian_password
```

### Web App (.env.local)

```bash
cd apps/web
cp .env.example .env.local
```

Edit `apps/web/.env.local`:

```env
# Local development
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000

# Dispatcher Account
VITE_DISPATCHER_EMAIL=omondi@reflex.co.ke
VITE_DISPATCHER_PASSWORD=your_secure_dispatcher_password

# Retailer Account
VITE_RETAILER_EMAIL=kamau@electronics.co.ke
VITE_RETAILER_PASSWORD=your_secure_retailer_password
```

## Step 3: Verify Railway Backend Access

Before starting the dev servers, verify you can connect to the Railway backend:

```bash
# Test authentication
curl -X POST https://backend-production-7f0d0.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"omondi@reflex.co.ke","password":"YOUR_PASSWORD_HERE"}'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "email": "omondi@reflex.co.ke",
      "role": "DISPATCHER"
    }
  }
}
```

If this fails:
- ❌ Check credentials are correct
- ❌ Verify Railway backend is online
- ❌ Check network connectivity
- ❌ Contact the backend team for credential verification

## Step 4: Start Development Servers

### Terminal 1: Start Backend Server

```bash
cd c:\Users\Work\Relflex\ tracker\ 1\Reflextracker
npm start
# or for development with auto-reload:
npm run dev
```

Expected output:
```
Reflex live proxy server running on http://localhost:3000 
linked to Railway: https://backend-production-7f0d0.up.railway.app/api
```

### Terminal 2: Start Mobile App

```bash
cd apps/mobile
npm run dev
```

Expected output:
```
  VITE v5.2.0  ready in 150 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

Visit http://localhost:5173 in your browser.

### Terminal 3: Start Web App

```bash
cd apps/web
npm run dev
```

Expected output:
```
  VITE v8.2.2  ready in 120 ms

  ➜  Local:   http://localhost:5174/
  ➜  press h to show help
```

Visit http://localhost:5174 in your browser.

## Step 5: Test Basic Workflow

### 1. Mobile App - Rider View

1. Open http://localhost:5173
2. Should see "ASSIGNED" deliveries for Brian Mutua (ID: 4)
3. Click on a delivery to view details
4. Verify geolocation permission prompt appears

### 2. Web App - Dispatcher View

1. Open http://localhost:5174
2. Should see all deliveries in "Dispatcher" tab
3. Click "Assign Rider" to assign a delivery to a rider
4. Verify real-time update in mobile app (if connected)

### 3. Test Offline Mode

1. In mobile app, press F12 to open DevTools
2. Go to "Network" tab
3. Check "Offline" checkbox
4. Try to confirm pickup (should queue offline)
5. Uncheck "Offline" 
6. Verify mutation syncs automatically

### 4. Test QR Scanning

1. In mobile app active delivery view
2. Click "Verify PIN / QR" button
3. Allow camera access when prompted
4. Point camera at a QR code or paper with barcode
5. Should detect and verify if code matches

## Step 6: Run Tests

### Unit Tests
```bash
npm test
```

### Integration Tests (requires Railway backend)
```bash
npm run test:integration
```

### E2E Tests (requires all servers running)
```bash
npm run test:e2e
```

## Troubleshooting

### Issue: "ECONNREFUSED" when trying to authenticate

**Cause:** Backend server not running or credentials wrong

**Fix:**
```bash
# 1. Verify backend is online
curl https://backend-production-7f0d0.up.railway.app/api/deliveries

# 2. Check credentials in .env files
# 3. Restart dev servers
```

### Issue: "Cannot find module" errors

**Cause:** Dependencies not installed

**Fix:**
```bash
# Reinstall all dependencies
rm -rf node_modules package-lock.json
npm install

# Same for apps
cd apps/mobile && npm install
cd ../web && npm install
```

### Issue: "Port 3000/5173/5174 already in use"

**Cause:** Another process using the port

**Fix:**
```bash
# Find process using port (on Windows)
netstat -ano | findstr :3000

# Kill process
taskkill /PID <PID> /F

# Or use different ports
# In vite.config.js, change server.port
```

### Issue: Camera not working in mobile app

**Cause:** Browser camera permission denied or not supported

**Fix:**
- Open http://localhost:5173 in Chromium/Chrome browser
- Allow camera permission when prompted
- On mobile device, use actual device camera (file input with capture)

### Issue: Real-time updates not working

**Cause:** WebSocket connection not established

**Fix:**
- Check `VITE_WS_BASE_URL` is set correctly (should be http://localhost:4000)
- Check backend server is running
- Open DevTools > Network > WS tab
- Look for socket.io connection

## Development Workflow

### Making Changes

1. **Mobile App Changes**
   ```bash
   cd apps/mobile
   npm run dev
   # Edit files in src/
   # Hot reload automatically
   ```

2. **Web App Changes**
   ```bash
   cd apps/web
   npm run dev
   # Edit files in src/
   # Hot reload automatically
   ```

3. **Server Changes**
   ```bash
   # Edit server.js
   # Server restarts automatically (needs npm run dev)
   ```

### Building for Production

```bash
# Mobile
cd apps/mobile && npm run build
# Output: apps/mobile/dist/

# Web
cd apps/web && npm run build
# Output: apps/web/dist/

# Server (no build needed for Node.js)
# Just deploy server.js with node_modules
```

## Next Steps

1. ✅ Complete [TEST_REPORT.md](../TEST_REPORT.md) test procedures
2. ✅ Run unit tests for each component
3. ✅ Perform end-to-end delivery workflow test
4. ✅ Test offline functionality
5. ✅ Test real-time updates with WebSocket
6. ✅ Deploy to staging environment

## Support

For issues or questions:

1. Check [TEST_REPORT.md](../TEST_REPORT.md) for known issues
2. Review [RAILWAY_API_SCHEMA.md](./RAILWAY_API_SCHEMA.md) for API contracts
3. Check browser console for JavaScript errors
4. Review server logs for backend errors

---

**Last Updated:** August 30, 2026  
**Status:** ✅ Critical Issues Fixed - Ready for Testing
