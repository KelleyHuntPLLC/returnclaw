# ReturnClaw API Reference

Base URL: `http://localhost:3001/api`

All endpoints require authentication via Bearer token or API key header.

```
Authorization: Bearer <token>
# or
X-API-Key: rc_live_...
```

---

## Table of Contents

- [Authentication](#authentication)
- [Returns](#returns)
- [Orders](#orders)
- [Voice](#voice)
- [Policy](#policy)
- [Dashboard](#dashboard)
- [Settings](#settings)
- [Webhooks](#webhooks)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Authentication

### POST `/auth/login`

Authenticate with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_01",
    "name": "Aisha Hunt",
    "email": "aisha@kelleyhunt.law",
    "created_at": "2026-01-15T00:00:00Z"
  }
}
```

### POST `/auth/signup`

Create a new account.

**Request:**
```json
{
  "name": "Aisha Hunt",
  "email": "aisha@kelleyhunt.law",
  "password": "securepassword"
}
```

**Response:** Same as login.

### POST `/auth/refresh`

Refresh an expired token.

**Request:**
```json
{
  "refresh_token": "rt_..."
}
```

---

## Returns

### GET `/returns`

List all returns for the authenticated user.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | — | Filter by status: `pending`, `approved`, `in_transit`, `delivered`, `refunded`, `rejected` |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (max 100) |
| `sort` | string | `created_at` | Sort field |
| `order` | string | `desc` | Sort order: `asc` or `desc` |

**Response:**
```json
{
  "returns": [
    {
      "id": "ret_01",
      "order_id": "ord_01",
      "retailer": "Amazon",
      "item_name": "Apple AirPods Pro (2nd Gen)",
      "amount": 249.00,
      "status": "in_transit",
      "reason": "Item doesn't match description",
      "tracking_number": "1Z999AA10123456784",
      "carrier": "UPS",
      "label_url": "https://labels.returnclaw.com/ret_01.pdf",
      "created_at": "2026-03-22T10:30:00Z",
      "updated_at": "2026-03-23T14:00:00Z",
      "estimated_refund_date": "2026-03-29",
      "timeline": [
        {
          "id": "evt_01",
          "status": "initiated",
          "description": "Return initiated via voice command",
          "timestamp": "2026-03-22T10:30:00Z"
        }
      ]
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

### GET `/returns/:id`

Get a single return by ID.

**Response:** Single return object (same structure as above).

### POST `/returns`

Initiate a new return.

**Request:**
```json
{
  "order_id": "ord_01",
  "item_name": "Apple AirPods Pro (2nd Gen)",
  "reason": "Item doesn't match description",
  "description": "The noise cancellation doesn't work as advertised"
}
```

**Response:**
```json
{
  "id": "ret_07",
  "order_id": "ord_01",
  "retailer": "Amazon",
  "item_name": "Apple AirPods Pro (2nd Gen)",
  "amount": 249.00,
  "status": "pending",
  "reason": "Item doesn't match description",
  "created_at": "2026-03-24T20:00:00Z",
  "timeline": [
    {
      "id": "evt_01",
      "status": "initiated",
      "description": "Return initiated",
      "timestamp": "2026-03-24T20:00:00Z"
    }
  ]
}
```

### POST `/returns/:id/label`

Generate a return shipping label.

**Request:**
```json
{
  "carrier": "ups"
}
```

**Response:**
```json
{
  "label_url": "https://labels.returnclaw.com/ret_07.pdf",
  "tracking_number": "1Z999AA10123456799",
  "carrier": "UPS",
  "estimated_delivery": "2026-03-27"
}
```

### POST `/returns/:id/pickup`

Schedule a carrier pickup.

**Request:**
```json
{
  "date": "2026-03-25",
  "time_window": "12:00-17:00",
  "address_id": "addr_01"
}
```

**Response:**
```json
{
  "pickup_id": "pck_01",
  "carrier": "UPS",
  "date": "2026-03-25",
  "time_window": "12:00 PM – 5:00 PM",
  "confirmation_number": "WTC12345678"
}
```

---

## Orders

### GET `/orders`

List detected orders.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |
| `returnable` | boolean | — | Filter to return-eligible orders only |

**Response:**
```json
{
  "orders": [
    {
      "id": "ord_01",
      "retailer": "Amazon",
      "retailer_order_id": "114-3941689-8772232",
      "items": [
        {
          "name": "Apple AirPods Pro (2nd Gen)",
          "price": 249.00,
          "quantity": 1,
          "image_url": "https://..."
        }
      ],
      "total": 249.00,
      "order_date": "2026-03-15",
      "delivery_date": "2026-03-18",
      "return_eligible": true,
      "return_deadline": "2026-04-17"
    }
  ],
  "total": 24
}
```

### GET `/orders/search`

Search orders by natural language query.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (e.g., "AirPods from Amazon") |

**Response:** Same structure as GET `/orders`.

---

## Voice

### POST `/voice/token`

Generate an ephemeral token for the OpenAI Realtime API.

**Response:**
```json
{
  "token": "eph_...",
  "expires_at": "2026-03-24T20:01:00Z",
  "session_id": "sess_abc123"
}
```

### POST `/voice/message`

Send a text message to the voice pipeline (for text-based voice mode).

**Request:**
```json
{
  "text": "Return my AirPods from Amazon",
  "session_id": "sess_abc123"
}
```

**Response:**
```json
{
  "response": "I found your Apple AirPods Pro ordered on March 15 from Amazon for $249.00. The return window is open until April 17. Would you like me to generate a return label?",
  "actions": [
    {
      "type": "return.initiate",
      "data": {
        "order_id": "ord_01",
        "item": "Apple AirPods Pro (2nd Gen)",
        "amount": 249.00
      }
    }
  ]
}
```

---

## Policy

### GET `/policy/:retailer`

Look up a retailer's return policy.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `retailer` | string | Retailer slug (e.g., `amazon`, `walmart`, `target`) |

**Response:**
```json
{
  "retailer": "Amazon",
  "return_window_days": 30,
  "free_returns": true,
  "restocking_fee": null,
  "conditions": [
    "Item must be in original condition",
    "Some categories have different windows (electronics: 30 days, luxury: 30 days)",
    "Digital content is non-returnable"
  ],
  "process": "Amazon provides prepaid return labels. Drop off at UPS, Whole Foods, or Kohl's. Refund processed within 3-5 business days of receipt.",
  "last_verified": "2026-03-20T00:00:00Z"
}
```

---

## Dashboard

### GET `/dashboard/stats`

Get dashboard statistics for the authenticated user.

**Response:**
```json
{
  "returns_this_month": 12,
  "money_saved": 2847.00,
  "active_returns": 3,
  "avg_return_days": 4.2,
  "returns_trend": 3,
  "money_trend": 489.00
}
```

---

## Settings

### GET `/settings`

Get user settings.

**Response:**
```json
{
  "email_connections": [
    {
      "id": "ec_01",
      "provider": "gmail",
      "email": "aisha@kelleyhunt.law",
      "connected": true,
      "last_synced": "2026-03-24T20:12:00Z"
    }
  ],
  "preferred_carrier": "ups",
  "notification_preferences": {
    "email": true,
    "push": true,
    "sms": false
  },
  "default_pickup_address": {
    "street": "1234 Commerce St",
    "city": "Denver",
    "state": "CO",
    "zip": "80202",
    "country": "US"
  }
}
```

### PATCH `/settings`

Update user settings. Send only the fields you want to change.

**Request:**
```json
{
  "preferred_carrier": "fedex",
  "notification_preferences": {
    "sms": true
  }
}
```

### POST `/settings/email/connect`

Initiate OAuth flow for email provider connection.

**Request:**
```json
{
  "provider": "gmail"
}
```

**Response:**
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "state_token_123"
}
```

### DELETE `/settings/email/:id`

Disconnect an email provider.

---

## Webhooks

### POST `/webhooks/register`

Register a webhook endpoint for real-time notifications.

**Request:**
```json
{
  "url": "https://your-app.com/webhook",
  "events": ["return.created", "return.status_changed", "return.refunded"],
  "secret": "whsec_your_signing_secret"
}
```

### Webhook Events

| Event | Description |
|-------|-------------|
| `return.created` | A new return was initiated |
| `return.approved` | Return was approved by retailer |
| `return.label_generated` | Shipping label was created |
| `return.shipped` | Package was picked up by carrier |
| `return.delivered` | Package delivered to return center |
| `return.refunded` | Refund was processed |
| `return.rejected` | Return was rejected |
| `order.detected` | New order detected from email |

### Webhook Payload

```json
{
  "event": "return.status_changed",
  "timestamp": "2026-03-24T20:15:00Z",
  "data": {
    "return_id": "ret_01",
    "old_status": "approved",
    "new_status": "in_transit",
    "tracking_number": "1Z999AA10123456784"
  }
}
```

Payloads are signed with HMAC-SHA256. Verify using the `X-ReturnClaw-Signature` header.

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "RETURN_NOT_ELIGIBLE",
    "message": "This item is outside the return window",
    "details": {
      "return_deadline": "2026-03-20",
      "days_over": 4
    }
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request — invalid parameters |
| `401` | Unauthorized — invalid or missing token |
| `403` | Forbidden — insufficient permissions |
| `404` | Not Found — resource doesn't exist |
| `409` | Conflict — return already exists for this order |
| `422` | Unprocessable — valid request but business logic prevented it |
| `429` | Rate Limited — too many requests |
| `500` | Internal Server Error |
| `502` | Bad Gateway — external service failure |

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication required |
| `INVALID_TOKEN` | Token is expired or invalid |
| `RETURN_NOT_ELIGIBLE` | Item is not eligible for return |
| `POLICY_WINDOW_CLOSED` | Return window has closed |
| `ORDER_NOT_FOUND` | Order could not be found |
| `CARRIER_ERROR` | Carrier API returned an error |
| `LABEL_GENERATION_FAILED` | Failed to generate shipping label |
| `RATE_LIMITED` | Request rate limit exceeded |

---

## Rate Limiting

Rate limits are applied per API key / user token:

| Endpoint | Limit |
|----------|-------|
| Standard API | 100 requests/minute |
| Voice sessions | 10 sessions/hour |
| Label generation | 20 labels/hour |
| Email sync | 5 syncs/hour |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1711321200
```

---

*For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md). For contributing, see [CONTRIBUTING.md](CONTRIBUTING.md).*
