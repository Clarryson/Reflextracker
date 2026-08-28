# REFLEX — Delivery Completion & Final Action Specification

This document details the mobile workflow, validation gates, and system teardown required for riders to finalize and complete an active delivery in `apps/mobile`.

---

## 1. Pre-Completion Validation Gate

The final completion action must remain disabled or inaccessible until all mandatory dropoff conditions are satisfied.

### Completion Checklist:
1. **Dropoff Proximity / Location:** Rider is at the dropoff destination.
2. **Verification Validated:** Dropoff QR code scanned successfully OR manual 6-digit PIN entered and verified against backend/local cache.
3. **Proof of Delivery (PoD) Captured:** Dropoff photo captured and compressed, or recipient handoff confirmed.
4. **Action Unlocked:** Once checklist items 2 and 3 are marked complete, transition the primary bottom button from disabled/scanning mode into the active **"Complete Delivery"** state.

---

## 2. Final Action UI/UX Mechanics

To prevent accidental submissions while keeping the interaction effortless with one hand in the field:

- **Full-Width Bottom Anchor:** Place the completion trigger across the bottom of the screen (56px height, high-contrast green/primary color).
- **Frictionless Trigger Option:**
  - *Option A (Swipe-to-Complete):* A horizontal slider where the rider swipes left-to-right. This eliminates pocket mis-clicks and accidental double taps.
  - *Option B (Single Tap with Progress Lock):* A prominent button that immediately disables itself upon click, displays an inline micro-spinner, and prevents duplicate submissions.
- **Immediate Sensory Confirmation:**
  - **Haptics:** Fire a distinct success vibration sequence (`[100, 50, 100]`) upon trigger.
  - **Audio:** Play a crisp completion chime.

---

## 3. Hardware & Background Lifecycle Teardown

Completing a delivery must immediately clean up mobile device resources to conserve battery, data, and memory:

```text
┌─────────────────────────────────────────────────────────────┐
│                 Rider Triggers "Complete"                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌───────────────────────┼───────────────────────┐
▼                       ▼                       ▼
┌──────────────┐      ┌─────────────────┐     ┌──────────────────┐
│ Hardware Off │      │ Socket Teardown │     │ Local Storage    │
│ • Clear GPS  │      │ • Leave room:   │     │ • Clear buffer   │
│   watchId    │      │   delivery:     │     │ • Set active     │
│ • Release    │      │ • Cease location│     │   delivery = null│
│   WakeLock   │      │   pings         │     │ • Prune outbox   │
└──────────────┘      └─────────────────┘     └──────────────────┘
```

1. **Terminate Geolocation Watcher:** Invoke `navigator.geolocation.clearWatch()` to shut down continuous GPS polling.
2. **Release Screen Wake Lock:** Release the `WakeLockSentinel` so the rider’s screen timeout returns to standard device settings.
3. **Leave Delivery WebSocket Room:** Emit `delivery:leave` for `delivery:<deliveryId>` to stop receiving tracking broadcasts.
4. **Local State Reset:** Clear active delivery memory references and wipe any temporary image previews from device memory.

---

## 4. Post-Completion Summary Screen

Rather than snapping abruptly back to a blank map, display a brief summary screen that provides closure and feedback:

- **Visual Confirmation:** Large green checkmark animation with order number.
- **Delivery Metrics:**
  - Total transit duration (from `pickedUpAt` to `deliveredAt`).
  - Dropoff timestamp.
- **Single Return CTA:** A prominent **"Ready for Next Order"** button that clears the screen and returns the rider to the standby/available pool.
- **Auto-Dismiss Timer:** Automatically return to the standby screen after 5 seconds if the rider does not interact with the summary screen.

---

## 5. Offline & Network Fault Tolerance for Finalization

If the final action is triggered in an elevator, basement, or poor coverage area:

1. **Optimistic Local Completion:** Advance the local delivery state to `DELIVERED` immediately. Show a badge stating `"Saved locally — syncing when online"`.
2. **Outbox Persistence:** Save the verification code, photo proof blob/URI, and completion timestamp to the IndexedDB mutation queue.
3. **Immediate Hardware Teardown:** Proceed with turning off GPS and screen locks locally—do not keep the GPS running while waiting for network restoration.
4. **Background Upload:** Flush the completion payload to `POST /api/deliveries/:id/verify` as soon as the browser detects an active network connection.

---

## 6. Acceptance Criteria (Definition of Done)

- [ ] "Complete Delivery" action cannot be triggered without valid QR scan or PIN match and photo capture.
- [ ] Tapping/swiping the completion action immediately halts device GPS watching and releases screen wake lock.
- [ ] Device triggers auditory and haptic feedback on successful completion.
- [ ] Order status updates to `DELIVERED` on the server and sets `deliveredAt`.
- [ ] Post-delivery summary card displays transit time and returns rider to available state.
- [ ] Completion works seamlessly in offline mode and syncs automatically upon reconnecting.