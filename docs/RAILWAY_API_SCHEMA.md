# Railway Backend API Schema Documentation

**Status:** Required for REFLEX Mobile & Web Apps  
**Last Updated:** August 30, 2026  
**Purpose:** Contract definition for API endpoints expected by client applications

---

## Authentication

### POST /auth/login

Authenticate a user and receive authorization token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 4,
      "email": "brian@rider.co.ke",
      "role": "RIDER",
      "name": "Brian Mutua"
    }
  }
}
```

**Response (Error 401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

**Status Codes:**
- `200` - Authentication successful
- `400` - Missing email or password
- `401` - Invalid credentials
- `500` - Server error

**Headers Required:** None (public endpoint)

---

## Delivery Management

### GET /deliveries

Fetch list of deliveries with optional filtering.

**Query Parameters:**
- `riderId` (optional) - Filter by assigned rider ID
- `status` (optional) - Filter by status (OPEN, ASSIGNED, PICKED_UP, DELIVERED)
- `limit` (optional) - Max results (default: 100)
- `skip` (optional) - Pagination offset

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": 1,
        "reference": "DEL-001",
        "status": "PICKED_UP",
        "customerName": "Amina Wanjiru",
        "customerPhone": "0712345678",
        "deliveryAddress": "Nairobi, Kenya",
        "retailerName": "Electronics Hub",
        "itemDescription": "Laptop 15-inch",
        "qrToken": "REFLEX-DEL-001-ABC123XYZ",
        "qrVerified": false,
        "riderId": 4,
        "riderName": "Brian Mutua",
        "createdAt": "2026-08-30T10:30:00Z",
        "pickedUpAt": "2026-08-30T11:00:00Z",
        "deliveredAt": null,
        "dropoffLat": -1.286389,
        "dropoffLng": 36.817223
      }
    ],
    "total": 1,
    "count": 1
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid query parameters
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`

---

### GET /deliveries/:id

Fetch single delivery details.

**Path Parameters:**
- `id` - Delivery ID (numeric or UUID)

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": 1,
      "reference": "DEL-001",
      "status": "PICKED_UP",
      "customerName": "Amina Wanjiru",
      "customerPhone": "0712345678",
      "deliveryAddress": "Nairobi, Kenya",
      "pickupAddress": "Electronics Hub Depot",
      "retailerName": "Electronics Hub",
      "itemDescription": "Laptop 15-inch",
      "qrToken": "REFLEX-DEL-001-ABC123XYZ",
      "qrVerified": false,
      "riderId": 4,
      "riderName": "Brian Mutua",
      "createdAt": "2026-08-30T10:30:00Z",
      "pickedUpAt": "2026-08-30T11:00:00Z",
      "deliveredAt": null,
      "dropoffLat": -1.286389,
      "dropoffLng": 36.817223
    }
  }
}
```

**Status Codes:**
- `200` - Success
- `404` - Delivery not found
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`

---

### POST /deliveries/:id/pickup

Confirm rider has picked up package.

**Path Parameters:**
- `id` - Delivery ID

**Request Body:**
```json
{
  "riderId": 4,
  "timestamp": "2026-08-30T11:00:00Z"
}
```

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": 1,
      "status": "PICKED_UP",
      "pickedUpAt": "2026-08-30T11:00:00Z"
    }
  }
}
```

**Response (Conflict 409):**
```json
{
  "success": false,
  "message": "Delivery already picked up or status changed"
}
```

**Status Codes:**
- `200` - Pickup confirmed
- `400` - Invalid rider or delivery ID
- `409` - Conflict (already picked up or reassigned)
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`, `Content-Type: application/json`

**Idempotency:** Should include `x-idempotency-key` header for safe retry

---

### POST /deliveries/:id/verify

Verify QR code or PIN before delivery completion.

**Path Parameters:**
- `id` - Delivery ID

**Request Body:**
```json
{
  "qrToken": "REFLEX-DEL-001-ABC123XYZ",
  "timestamp": "2026-08-30T14:30:00Z"
}
```

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "delivery": {
      "id": 1,
      "status": "PICKED_UP",
      "qrVerified": true
    }
  }
}
```

**Response (Invalid Code 400):**
```json
{
  "success": false,
  "message": "Invalid QR code or verification token"
}
```

**Response (Already Verified 409):**
```json
{
  "success": false,
  "message": "Delivery already completed or verification code already used"
}
```

**Status Codes:**
- `200` - QR verified successfully
- `400` - Invalid token/code
- `409` - Already completed or conflict
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`, `Content-Type: application/json`

---

### POST /deliveries/:id/proof

Upload proof of delivery (photo/signature).

**Path Parameters:**
- `id` - Delivery ID

**Request Body (multipart/form-data):**
```
Field: proof (file)
Type: image/jpeg, image/png, image/webp
Max Size: 5MB (recommended <500KB after compression)
```

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "proofUrl": "https://storage.railway.app/pod/delivery-1-proof-2026-08-30.jpg",
    "proofUploaded": true
  }
}
```

**Response (File Too Large 413):**
```json
{
  "success": false,
  "message": "Proof image exceeds maximum size"
}
```

**Status Codes:**
- `200` - Proof uploaded
- `400` - Invalid file or delivery ID
- `413` - File too large
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Note:** Proof can be uploaded multiple times before completion for retry scenarios

---

### POST /deliveries/:id/complete

Mark delivery as completed.

**Path Parameters:**
- `id` - Delivery ID

**Request Body:**
```json
{
  "notes": "Delivered to customer. Package signed for.",
  "timestamp": "2026-08-30T14:35:00Z",
  "completionCoordinates": {
    "latitude": -1.286389,
    "longitude": 36.817223,
    "accuracy": 15
  }
}
```

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": 1,
      "status": "DELIVERED",
      "deliveredAt": "2026-08-30T14:35:00Z",
      "completedBy": "Brian Mutua"
    }
  }
}
```

**Response (Missing Requirements 400):**
```json
{
  "success": false,
  "message": "Delivery requires verified QR code and proof photo before completion"
}
```

**Response (Conflict 409):**
```json
{
  "success": false,
  "message": "Delivery has been reassigned or cancelled"
}
```

**Status Codes:**
- `200` - Delivery completed
- `400` - Missing verification or proof
- `409` - Conflict (reassigned/cancelled)
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`, `Content-Type: application/json`

**Idempotency:** Should include `x-idempotency-key` header for safe retry

---

### POST /deliveries/:id/locations/batch

Store batch of GPS location points during transit.

**Path Parameters:**
- `id` - Delivery ID

**Request Body:**
```json
{
  "locations": [
    {
      "latitude": -1.286389,
      "longitude": 36.817223,
      "accuracy": 15,
      "timestamp": "2026-08-30T11:05:00Z"
    },
    {
      "latitude": -1.287100,
      "longitude": 36.818500,
      "accuracy": 20,
      "timestamp": "2026-08-30T11:10:00Z"
    }
  ]
}
```

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "stored": 2,
    "delivery": {
      "id": 1,
      "locationCount": 42
    }
  }
}
```

**Response (Invalid Data 400):**
```json
{
  "success": false,
  "message": "Invalid location data format"
}
```

**Status Codes:**
- `200` - Locations stored
- `400` - Invalid coordinates or data
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`, `Content-Type: application/json`

**Constraints:**
- Max 50 locations per request
- Timestamp must be recent (within 24 hours)
- Coordinates must be valid (lat: -90 to 90, lng: -180 to 180)

---

## Rider Management

### GET /riders

Fetch list of available riders.

**Query Parameters:**
- `status` (optional) - AVAILABLE, BUSY, OFFLINE
- `limit` (optional) - Max results

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "riders": [
      {
        "id": 4,
        "name": "Brian Mutua",
        "email": "brian@rider.co.ke",
        "status": "AVAILABLE",
        "phone": "0712345678",
        "ratings": 4.8,
        "completedDeliveries": 156
      }
    ]
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `500` - Server error

**Headers Required:** `Authorization: Bearer {token}`

---

## Real-Time WebSocket Events

### Connection
```javascript
socket.connect();
socket.emit('rider:join', { riderId: 4 });
```

### Incoming Events (Listen)

#### delivery:assigned
```javascript
socket.on('delivery:assigned', (data) => {
  // data = { delivery: {...}, assignedAt: "2026-08-30T10:30:00Z" }
});
```

#### delivery:status_changed
```javascript
socket.on('delivery:status_changed', (data) => {
  // data = { deliveryId: 1, status: "PICKED_UP", changedAt: "..." }
});
```

#### delivery:cancelled
```javascript
socket.on('delivery:cancelled', (data) => {
  // data = { deliveryId: 1, reason: "Customer requested cancellation" }
});
```

#### delivery:reassigned
```javascript
socket.on('delivery:reassigned', (data) => {
  // data = { deliveryId: 1, newRiderId: 5, reason: "Load balancing" }
});
```

### Outgoing Events (Emit)

#### rider:location_update
```javascript
socket.emit('rider:location_update', {
  deliveryId: 1,
  riderId: 4,
  latitude: -1.286389,
  longitude: 36.817223,
  timestamp: "2026-08-30T11:05:00Z"
});
```

#### delivery:leave
```javascript
socket.emit('delivery:leave', { deliveryId: 1 });
```

---

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "DELIVERY_NOT_FOUND",
    "message": "Delivery with ID 999 does not exist",
    "status": 404
  }
}
```

### Common Error Codes
- `DELIVERY_NOT_FOUND` (404) - Requested delivery doesn't exist
- `UNAUTHORIZED` (401) - Missing or invalid authentication token
- `FORBIDDEN` (403) - User lacks permission for this action
- `CONFLICT` (409) - Delivery status changed or already processed
- `VALIDATION_ERROR` (400) - Invalid request data
- `SERVER_ERROR` (500) - Internal server error

---

## Rate Limiting

- **Authenticated Requests:** 100 requests per minute per token
- **Location Updates:** 10 updates per minute per delivery
- **Authentication:** 5 login attempts per minute per email

Response includes headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1693382400
```

---

## Implementation Notes

### Token Management
- Tokens expire after 24 hours
- Include `Authorization: Bearer {token}` in all authenticated requests
- Implement token refresh on 401 response

### Idempotency
- For mutation endpoints (POST, PATCH), include `x-idempotency-key` header
- Server will deduplicate requests with same key within 24 hours
- Prevents duplicate deliveries on network retry

### Offline Support
- Cache delivery data locally with IndexedDB
- Queue mutations for sending when online
- Use `idempotencyKey` to handle reconnections safely

### CORS
- All endpoints support CORS
- Origin: `*` (open to all clients)
- Credentials: supported with proper headers

---

## Testing Credentials

**Dispatcher Account:**
- Email: `omondi@reflex.co.ke`
- Password: Use `DISPATCHER_PASSWORD` from `.env`

**Retailer Account:**
- Email: `kamau@electronics.co.ke`
- Password: Use `RETAILER_PASSWORD` from `.env`

**Test Riders:**
- Brian Mutua (ID: 4): `brian@rider.co.ke`
- Grace Njeri (ID: 5): `grace@rider.co.ke`
- James Kipchoge (ID: 6): `james@rider.co.ke`

Passwords stored in environment variables in `.env` file.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-08-30 | Initial schema documentation based on code analysis |

---

## Need to Verify

This schema is based on code expectations. **The following require verification with the actual Railway backend:**

1. ✅ All endpoint paths match actual implementation
2. ✅ All response schemas match database models
3. ✅ All status codes documented match actual HTTP responses
4. ✅ All error messages match backend error handling
5. ✅ Rate limiting is configured as documented
6. ✅ WebSocket room naming conventions (e.g., `delivery:1`, `rider:4`)
7. ✅ Idempotency key handling is implemented server-side
8. ✅ QR token format and validation rules
