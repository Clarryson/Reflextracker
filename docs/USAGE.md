# REFLEX Installation and Usage Guide

This guide explains how to install, configure, run, and verify the REFLEX delivery management platform locally for development and end-to-end testing.

## 1) Prerequisites & Environment Setup

### Required tools

- Node.js 18+ or 20+
- npm 9+
- Git
- A modern browser with developer tools
- Optional: Docker/Compose is not required for the current setup
- A local backend connection to the Railway API or the local proxy server

### 1.1 Backend environment

The backend application is the local Express + Socket.IO proxy that communicates with the Railway API.

1. Copy the root environment file:

```bash
cp .env.example .env
```

2. Update the values in `.env` with your real credentials:

```env
RAILWAY_API=https://backend-production-7f0d0.up.railway.app/api
PORT=3000
DISPATCHER_EMAIL=omondi@reflex.co.ke
DISPATCHER_PASSWORD=your_secure_dispatcher_password
RETAILER_EMAIL=kamau@electronics.co.ke
RETAILER_PASSWORD=your_secure_retailer_password
RIDER_EMAIL_BRIAN=brian@rider.co.ke
RIDER_PASSWORD_BRIAN=your_secure_brian_password
RIDER_EMAIL_GRACE=grace@rider.co.ke
RIDER_PASSWORD_GRACE=your_secure_grace_password
RIDER_EMAIL_JAMES=james@rider.co.ke
RIDER_PASSWORD_JAMES=your_secure_james_password
```

> Never commit `.env` files to Git. Keep them local and secure.

### 1.2 Retailer / Dispatcher web app environment

The web app requires its own frontend environment file.

1. Go to the web app folder:

```bash
cd apps/web
cp .env.example .env.local
```

2. Update `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
VITE_DISPATCHER_EMAIL=omondi@reflex.co.ke
VITE_DISPATCHER_PASSWORD=your_secure_dispatcher_password
VITE_RETAILER_EMAIL=kamau@electronics.co.ke
VITE_RETAILER_PASSWORD=your_secure_retailer_password
VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=your_secure_password_here
VITE_RIDER_ID_5_EMAIL=grace@rider.co.ke
VITE_RIDER_ID_5_PASSWORD=your_secure_password_here
VITE_RIDER_ID_6_EMAIL=james@rider.co.ke
VITE_RIDER_ID_6_PASSWORD=your_secure_password_here
```

### 1.3 Rider PWA environment

The rider app is a Vite React PWA built for the rider workflow.

1. Go to the mobile app folder:

```bash
cd apps/mobile
cp .env.example .env.local
```

2. Update `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_WS_BASE_URL=http://localhost:4000
VITE_DEFAULT_RIDER_ID=4
VITE_RIDER_ID_4_EMAIL=brian@rider.co.ke
VITE_RIDER_ID_4_PASSWORD=your_secure_password_here
VITE_RIDER_ID_5_EMAIL=grace@rider.co.ke
VITE_RIDER_ID_5_PASSWORD=your_secure_password_here
VITE_RIDER_ID_6_EMAIL=james@rider.co.ke
VITE_RIDER_ID_6_PASSWORD=your_secure_password_here
```

### 1.4 Install project dependencies

From the project root:

```bash
npm install
cd apps/web && npm install
cd ../mobile && npm install
```

## 2) Local Installation & Running Instructions

### 2.1 Start the backend

From the project root:

```bash
node server.js
```

Expected behavior:
- The proxy server starts on `http://localhost:3000`
- It connects to the Railway backend and exposes live delivery data through Socket.IO

If you want a custom port:

```bash
PORT=3000 node server.js
```

### 2.2 Start the retailer / dispatcher web app

In a separate terminal:

```bash
cd apps/web
npm run dev -- --host 0.0.0.0
```

The app should open at a Vite port such as:

```text
http://localhost:5173
```

### 2.3 Start the rider PWA

In a second separate terminal:

```bash
cd apps/mobile
npm run dev -- --host 0.0.0.0
```

The rider app should open at a Vite port such as:

```text
http://localhost:5174
```

### 2.4 Verify the app stack is live

Check the following:

- Backend responds on `http://localhost:3000`
- Web app loads and shows retailer/dispatcher UI
- Mobile app loads and shows rider assignment screens
- Real-time delivery events appear after assignment and status changes

## 3) Testing & Verification

### 3.1 Automated checks

At a minimum, build each frontend app to validate the project compiles correctly:

```bash
cd apps/web && npm run build
cd ../mobile && npm run build
```

If the repo later adds test scripts, run them with:

```bash
npm test
```

### 3.2 Manual end-to-end verification

Use the following flow for a manual QA cycle:

1. Open the web app as the retailer or dispatcher.
2. Confirm the backend is running and the web UI loads without console errors.
3. Open the rider app in a separate browser tab or device.
4. Ensure the rider ID and app live connection appear correctly.
5. Trigger a delivery lifecycle via the UI and verify the state transitions.

### 3.3 Recommended browser checks

Validate the following in the browser:

- delivery creation appears in the dispatcher dashboard
- rider assignment updates the delivery status
- PWA refreshes and receives assignment updates in real time
- rider can open an assigned delivery
- pickup flow updates status from `ASSIGNED` to `PICKED_UP`
- QR verification accepts the correct code and rejects invalid code
- proof upload completes without runtime errors
- final status changes to `DELIVERED`

### 3.4 API and socket verification

In the browser console or by calling the backend directly:

```bash
curl http://localhost:3000/api/live/deliveries
```

Check that the API returns a valid JSON payload with delivery records.

## 4) End-to-End Workflow Guide

This is the expected REFLEX user journey.

### Step 1: Retailer creates delivery (OPEN)

1. Open the retailer web interface.
2. Fill in customer, phone, address, and item details.
3. Submit the form.
4. Confirm the delivery appears in the system as `OPEN`.
5. The backend should create the order on the Railway API and push the update through the live feed.

### Step 2: Dispatcher assigns rider (ASSIGNED)

1. Open the dispatcher view.
2. Select a delivery.
3. Choose a rider (for example Brian, Grace, or James).
4. Submit the rider assignment.
5. Confirm the delivery state changes to `ASSIGNED`.
6. Verify the rider receives a live assignment in the PWA.

### Step 3: Rider receives in PWA and picks up (PICKED UP)

1. Open the rider PWA on the mobile device or browser.
2. Confirm the assigned delivery appears in the rider dashboard.
3. Select the delivery and confirm pickup.
4. Confirm the status changes to `PICKED_UP`.
5. The rider app should show transit / active delivery state.

### Step 4: Rider verifies via QR code and uploads proof

1. Enter the active delivery view.
2. Scan the QR code shown by the customer or enter the verification code manually.
3. Confirm the value matches the expected delivery verification token.
4. Upload the proof-of-delivery image.
5. Confirm the system accepts the proof and continues the delivery flow.

### Step 5: Delivery completed (DELIVERED)

1. Submit the completion action after QR verification and proof upload.
2. Confirm the status changes to `DELIVERED`.
3. Verify the delivery is removed from active work and appears in the completed state or delivery summary.
4. Check that the dispatcher and retailer views reflect the completed result.

## 5) Recommended Local Development Workflow

Use the following order when working locally:

```bash
# 1. Install dependencies
npm install
cd apps/web && npm install
cd ../mobile && npm install

# 2. Configure environment files
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local

# 3. Start backend
cd ../..
node server.js

# 4. Start web app in another terminal
cd apps/web
npm run dev -- --host 0.0.0.0

# 5. Start rider PWA in another terminal
cd ../mobile
npm run dev -- --host 0.0.0.0
```

## 6) Issue #60 Completion Checklist

- [ ] Dependencies installed
- [ ] Environment files created and populated
- [ ] Backend started
- [ ] Web app started
- [ ] Rider PWA started
- [ ] Delivery lifecycle validated from OPEN to DELIVERED
- [ ] QR verification and proof upload tested
- [ ] Documentation reviewed and ready for PR

## 7) Git Workflow for Issue #60

### Create the issue branch from main

If your repository has a local `main` branch already:

```bash
git checkout main
git pull origin main
git checkout -b docs/install-and-usage-guide
```

If `main` does not exist in your local clone yet, create it from the current default branch first:

```bash
git fetch origin
git checkout feature/project-foundation
git checkout -b main
git pull origin main
git checkout -b docs/install-and-usage-guide
```

### Stage, commit, push, and open the PR

```bash
git add docs/USAGE.md
git commit -m "docs: add installation and usage guide for issue #60"
git push -u origin docs/install-and-usage-guide
```

Then open a pull request:

```bash
gh pr create --base main --head docs/install-and-usage-guide \
  --title "docs: add installation and usage guide" \
  --body "Closes #60\n\n- Add local setup instructions for backend, web app, and rider PWA\n- Document environment variables and startup commands\n- Add manual verification steps and end-to-end delivery workflow\n- Describe the REFLEX lifecycle from OPEN to DELIVERED"
```

If GitHub CLI is not installed, open the repository in GitHub and create the pull request manually from:

- base: `main`
- compare: `docs/install-and-usage-guide`

This PR closes Issue #60 once merged.
