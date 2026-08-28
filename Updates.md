# REFLEX — Real-Time Updates & Event Handling Specification

This document defines how `apps/mobile` handles incoming server events, state updates, and alerts in real time over WebSockets (Socket.io) without requiring manual browser refreshes.

---

## 1. WebSocket Room Subscription & Connection Lifecycle

To receive scoped updates without global broadcast overhead, the rider client must subscribe to a rider-specific channel upon startup.

### Connection Workflow:
1. **Initialize Singleton Socket:** Establish connection to the server on app mount.
2. **Join Dedicated Room:** Immediately emit `rider:join` with payload `{ riderId }`. The server adds this socket to room `rider:<riderId>`.
3. **Join Active Delivery Room:** When a delivery is active (`ASSIGNED` or `PICKED_UP`), join room `delivery:<deliveryId>`.
4. **Auto-Reconnection:** Enable automatic reconnection with exponential backoff (`reconnectionAttempts: Infinity`, `reconnectionDelay: 1000`).
5. **Clean Teardown:** Leave active rooms and unbind listeners when components unmount or deliveries complete.

---

## 2. Inbound Event Contract (Server → Rider Client)

| Event Name | Payload Structure | Trigger Scenario | Expected Mobile Action |
| :--- | :--- | :--- | :--- |
| `delivery:assigned` | `{ delivery: Object, assignedAt: String }` | Dispatcher assigns a new delivery to this rider. | Play arrival chime, trigger vibration, update state from idle to assigned, and show assignment modal/banner. |
| `delivery:reassigned` | `{ deliveryId: String, reason: String }` | Dispatcher assigns order to another rider or revokes assignment. | Alert rider with a non-blocking modal, clear active delivery state, and reset UI to available pool. |
| `delivery:cancelled` | `{ deliveryId: String, reason: String }` | Retailer or Dispatcher cancels the order. | Trigger cancellation alert, release active delivery tracking, and return to idle screen. |
| `delivery:status_changed` | `{ deliveryId: String, status: String }` | Delivery status is updated by another actor or system process. | Reconcile local state badge and advance lifecycle flow immediately. |

---

## 3. Reactive State Management (No-Refresh Architecture)

- **Centralized Event Listener:** Maintain Socket.io event subscriptions in a dedicated hook or state context rather than scattering listeners across individual UI components.
- **Atomic State Transitions:**
  - On `delivery:assigned`: Replace the empty state with the new delivery payload directly in memory.
  - On `delivery:reassigned` or `delivery:cancelled`: Gracefully transition the active screen back to the standby/idle screen without reloading.
- **Non-Modal Overlay Banners:** When a new delivery arrives, surface an immediate bottom-sheet banner or action drawer with pickup details, ETA, and an "Acknowledge" button instead of full-screen interruptions.

---

## 4. Reconnection & Catch-Up Hydration

If the rider drives through a tunnel or loses network connectivity temporarily, WebSocket messages emitted during that window may be missed.

### Catch-Up Strategy:
1. **Listen for `connect` Event:** Whenever the socket reconnects after a drop:
   - Re-emit `rider:join` to restore room subscription.
   - Execute a background REST fetch (`GET /api/deliveries?riderId=:id&status=ASSIGNED,PICKED_UP`) to pull the authoritative server state.
2. **Reconciliation:**
   - If the delivery is still assigned to this rider: Silently merge any updated fields.
   - If the delivery was cancelled or reassigned during downtime: Update the UI to reflect the change and show a brief informative toast.

---

## 5. Multi-Sensory Alert Pipeline

Riders often keep their phones in mounts or pockets while driving, meaning visual UI updates alone are insufficient.

- **Auditory Alerts:** Play a high-contrast sound effect (e.g., short dual-tone chime) on `delivery:assigned` using the HTML5 Audio API.
- **Haptic Feedback:** Trigger continuous pulse vibrations (`navigator.vibrate([200, 100, 200, 100, 400])`) when a new assignment arrives.
- **Web Notifications API:** If the PWA is running in the background or minimized, request permission on first boot and trigger a system push notification:
  - *Title:* "New Delivery Assigned"
  - *Body:* "Pickup at [Pickup Address] — Tap to view details."

---

## 6. Acceptance Criteria (Definition of Done)

- [ ] New delivery assigned by the dispatcher appears on screen within <1 second without page refresh.
- [ ] Incoming assignment triggers distinct audio and haptic vibration alerts.
- [ ] If an order is cancelled or reassigned by the dispatcher, the active screen clears gracefully with an explanation toast.
- [ ] Socket automatically reconnects after network recovery and triggers a silent state catch-up fetch.
- [ ] System notifications display when the app is in the background.