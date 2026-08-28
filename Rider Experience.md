# REFLEX — Rider Experience & Field Usability Specification

This document outlines the core field-usability principles for the Rider PWA (`apps/mobile`).

## 1. Physical Ergonomics & Thumb-Zone UI
- Bottom-anchor all primary actions (e.g., "Confirm Pickup", "Scan QR") within the bottom 30% of the viewport.
- Maintain minimum touch targets of 48–56px for one-handed operation.
- Implement high-contrast typography readable under direct sunlight.
- Use swipe-to-confirm mechanics for irreversible status transitions.

## 2. Cognitive Load & Context-Aware Views
- Display only the current active delivery and immediate next step.
- Include one-tap deep-link launchers for native GPS navigation apps.
- Provide direct `tel:` links for quick retailer/customer communication.
- Offer an instant manual PIN entry fallback beneath the QR camera viewfinder.

## 3. Intermittent Connectivity & Speed Optimization
- Precache app shell assets via the Service Worker for instant offline loading.
- Apply optimistic UI state updates on pickup and verification events.
- Buffer telemetry and status events in IndexedDB/LocalStorage during network drops.
- Display non-intrusive offline status indicators.

## 4. Hardware Efficiency & Battery Conservation
- Run high-accuracy GPS tracking strictly during the `PICKED_UP` state.
- Throttle coordinate updates when stationary.
- Utilize the Screen Wake Lock API during active transit.
- Compress proof-of-delivery images locally before network upload.

## 5. Multi-Sensory Feedback
- Trigger device vibration feedback on scan success, errors, and assignments.
- Play brief audio chimes for state confirmation without requiring screen focus.
