# REFLEX 🚚

## Real-Time Delivery Tracking & Management Platform

REFLEX is a full-stack delivery management platform designed to connect
retailers, dispatchers, and riders through a single real-time system.

The platform manages the complete delivery journey, from creating a
delivery to assigning a rider, confirming pickup, verifying the delivery,
submitting proof of delivery, and completing the delivery.

## MVP Users

### Retailer
- Create deliveries
- View deliveries
- Track delivery status

### Dispatcher
- View deliveries
- Assign riders
- Reassign riders
- Monitor delivery progress

### Rider
- View assigned deliveries
- Confirm pickup
- Scan QR codes
- Submit proof of delivery
- Complete deliveries

## Delivery Lifecycle

OPEN
↓
ASSIGNED
↓
PICKED_UP
↓
DELIVERED

## Project Structure

```text
REFLEX/
├── apps/
│   ├── web/
│   └── mobile/
├── server/
├── prisma/
├── docs/
├── tests/
├── .env.example
├── .gitignore
└── README.md



Development Rules
REFLEX .
.js and .jsx files are allowed .ts not  allowed for now.
TypeScript is not used in this project.
Authentication is outside the current MVP scope.
All feature work must be done through feature branches.
Pull requests must be reviewed before merging into the main development branch.
Team

REFLEX is developed by a five-member team:

Team Lead & System Architect
Backend & Real-Time Developer
Web Frontend Developer
Mobile PWA Developer
QA, Security & DevOps Engineer
