# Rate-Limited Multi-Tenant SaaS API

A high-performance, production-ready multi-tenant backend API built with **Node.js**, **Express 5**, **PostgreSQL**, and **Redis**. Featuring distributed atomic rate limiting across three distinct algorithms, cryptographic SHA-256 API key authentication, and strict multi-tenant data isolation.

---

## 🏗️ Architecture Overview

```
                          ┌──────────────────────────┐
                          │       Client / HTTP       │
                          └─────────────┬────────────┘
                                        │
                                        ▼
                  ┌──────────────────────────────────────────┐
                  │          Express Application             │
                  │   ┌──────────────────────────────────┐   │
                  │   │   1. API Key Auth Middleware     │   │
                  │   │   - SHA-256 Hash of Bearer Token │   │
                  │   │   - DB Plan & Tenant Lookup      │   │
                  │   │   - Verifies revoked_at IS NULL  │   │
                  │   └─────────────────┬────────────────┘   │
                  │                     │                    │
                  │   ┌─────────────────▼────────────────┐   │
                  │   │   2. Rate Limiting Middleware    │   │
                  │   │   - Tenant & Plan-aware Limits   │   │
                  │   │   - Standard Headers Injection   │   │
                  │   └─────────────────┬────────────────┘   │
                  │                     │                    │
                  │   ┌─────────────────▼────────────────┐   │
                  │   │     3. Scoped Controllers        │   │
                  │   │     (Tenants, Keys, Resources)   │   │
                  │   └─────────────────┬────────────────┘   │
                  └─────────────────────┼────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
       ┌─────────────────────────┐             ┌─────────────────────────┐
       │       PostgreSQL        │             │          Redis          │
       │   - tenants             │             │   - Window Counters     │
       │   - users               │             │   - Timestamp ZSETs     │
       │   - api_keys (hashed)   │             │   - Token Bucket Hashes │
       │   - resources           │             │   - Atomic Lua Scripts  │
       └─────────────────────────┘             └─────────────────────────┘
```

---

## 🛠️ Tech Stack

- **Runtime & Framework**: [Node.js](https://nodejs.org/) (ES Modules) & [Express.js 5](https://expressjs.com/)
- **Rate-Limiting Cache**: [Redis](https://redis.io/) via [`ioredis`](https://github.com/redis/ioredis) (Pipelines, Transactions, and Lua scripts)
- **Primary Database**: [PostgreSQL](https://www.postgresql.org/) via [`pg`](https://node-postgres.com/) (Connection pooling, raw parameterized SQL)
- **Security & Crypto**: Node.js native `crypto` module (SHA-256 hashing, CSPRNG hex generation)
- **Containerization**: Docker & Docker Compose

---

## 🚀 Key Features

### 1. Cryptographic API Key Authentication
- **No Plaintext Storage**: Raw API keys (32-byte hex generated via `crypto.randomBytes`) are shown **once** upon generation.
- **Deterministic SHA-256 Hashing**: Stored as SHA-256 hashes (`crypto.createHash('sha256')`).
- **Instant Soft Revocation**: Revocation is tracked via `revoked_at TIMESTAMP`. Revoked keys immediately return `401 Unauthorized`.
- **Tenant Context Injection**: Authenticated requests populate `req.user = { tenant_id, plan }` for downstream middleware and handlers.

### 2. Multi-Tenant Data Isolation
- Strict tenant isolation enforced at the database layer.
- All resource queries and API key revocations are scoped by `tenant_id` (`WHERE id = $1 AND tenant_id = $2`), preventing cross-tenant access.

### 3. Dynamic Plan-Based Tiers
Rate limits adjust automatically based on the tenant's subscribed plan:

| Tier | Capacity / Window | Refill Rate (Token Bucket) |
|---|---|---|
| **Free** | 10 requests / min | 10 tokens / 60s (~0.166 tokens/s) |
| **Pro** | 100 requests / min | 100 tokens / 60s (~1.666 tokens/s) |
| **Enterprise** | 500 requests / min | 500 tokens / 60s (~8.333 tokens/s) |

### 4. Standard Rate Limit Headers
Every response includes standard RFC-compliant rate limit headers:
- `X-RateLimit-Limit`: Maximum requests allowed in the current window / bucket capacity.
- `X-RateLimit-Remaining`: Count of remaining allowed requests before throttling (clamped to 0).
- `Retry-After`: Seconds to wait before retrying (included on `429 Too Many Requests`).

---

## ⚙️ Rate Limiting Algorithms Deep-Dive

This project implements and evaluates three distinct rate limiting algorithms:

### 1. Fixed Window Limiter (`src/middleware/rateLimiter.js`)
- **How It Works**: Divides time into fixed discrete buckets (e.g. 60-second windows). Uses Redis `SET key 0 EX 60 NX` followed by `INCR key`.
- **Key Schema**: `rate:<tenant_id>:<window_start_timestamp>`
- **Pros**: Minimal memory footprint (single integer counter) and O(1) performance.
- **Cons**: Vulnerable to the **boundary spike problem** (up to 2x the limit allowed across window transitions).

### 2. Sliding Window Log (`src/middleware/slidingWindowLimiter.js`)
- **How It Works**: Stores every individual request timestamp as a score and unique member (`${now}-${Math.random()}`) inside a Redis Sorted Set (`ZSET`).
- **Key Schema**: `rate:<tenant_id>`
- **Atomicity via `MULTI/EXEC` Pipeline**:
  ```javascript
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart); // Purge expired entries
  multi.zadd(key, now, `${now}-${Math.random()}`); // Record current request
  multi.zcard(key); // Count active requests in window
  multi.expire(key, windowSize); // Auto-expire idle keys
  const results = await multi.exec();
  ```
- **Pros**: 100% boundary accuracy; completely eliminates boundary spike anomalies.
- **Cons**: High memory consumption at high request volumes (every request is an entry in the log).

### 3. Token Bucket (`src/middleware/TokenBucket.js`)
- **How It Works**: Tokens accumulate at a steady refill rate up to a maximum bucket capacity. Each request consumes 1 token. Allows bursts while maintaining a strict long-term rate.
- **Key Schema**: `token_bucket:<tenant_id>` (Redis Hash storing `tokens` and `last_refilled`)
- **Lazy Refill via Redis Lua Script**:
  - No background polling timers required.
  - Refill math (`delta * refillRate`) and token deduction run in a single atomic Lua script via `redis.eval()`.
  - Eliminates all race conditions between read, computation, and write.
- **Pros**: Smooth rate enforcement, supports natural traffic bursts, memory-efficient (fixed-size hash).
- **Cons**: Slightly higher compute per request inside Redis (Lua script execution).

### Algorithm Comparison Table

| Metric | Fixed Window | Sliding Window Log | Token Bucket |
|---|---|---|---|
| **Redis Structure** | String counter | Sorted Set (`ZSET`) | Hash (`tokens`, `last_refilled`) |
| **Atomicity Mechanism** | `SET NX` + `INCR` | `MULTI/EXEC` Pipeline | Redis Lua Script (`redis.eval`) |
| **Memory Complexity** | O(1) per window | O(N) where N = requests in window | O(1) fixed per tenant |
| **Burst Handling** | Poor (2x burst at boundary) | Strict (no bursts beyond limit) | Smooth (allows bursts up to capacity) |
| **Production Fit** | High-throughput, simple metering | Strict compliance APIs (financial/SMS) | General SaaS APIs & webhooks |

---

## 🔌 API Reference

### 1. Tenant Provisioning
#### `POST /api/v1/tenants`
Creates a new tenant organization.

- **Request Body**:
  ```json
  {
    "name": "Acme Corp",
    "plan": "pro"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": "c1f7a229-873b-4ce1-8f81-9b161304f47e",
    "name": "Acme Corp",
    "plan": "pro",
    "created_at": "2026-08-30T10:00:00.000Z"
  }
  ```

---

### 2. API Key Management
#### `POST /api/v1/keys`
Generates a new API key for a tenant. The raw key is returned **only once**.

- **Request Body**:
  ```json
  {
    "tenant_id": "c1f7a229-873b-4ce1-8f81-9b161304f47e",
    "name": "Production Service Key"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": "4e12c5b7-789a-4c22-b052-7b56e6dcf321",
    "apiKey": "4f8a31e84a2754c0b5f12e8b...",
    "name": "Production Service Key",
    "tenant_id": "c1f7a229-873b-4ce1-8f81-9b161304f47e",
    "created_at": "2026-08-31T11:00:00.000Z"
  }
  ```

#### `PATCH /api/v1/keys/:id/revoke`
Revokes an existing key immediately (soft delete). Requires tenant API key authentication.

- **Headers**:
  `Authorization: Bearer <API_KEY>`
- **Response (200 OK)**:
  ```json
  {
    "message": "Key revoked successfully"
  }
  ```

---

### 3. Protected Resources
All resource routes require API Key authentication and pass through the active rate limiter.

#### `GET /api/v1/resources`
Fetches resources belonging to the authenticated tenant.

- **Headers**:
  `Authorization: Bearer <API_KEY>`
- **Response (200 OK)**:
  - **Headers**:
    - `X-RateLimit-Limit: 100`
    - `X-RateLimit-Remaining: 99`
  - **Body**:
    ```json
    {
      "resources": [
        {
          "id": "7a3b4912-320d-4091-83fb-98bc43f01c87",
          "tenant_id": "c1f7a229-873b-4ce1-8f81-9b161304f47e",
          "name": "Reports Dataset",
          "created_at": "2026-08-31T12:00:00.000Z"
        }
      ]
    }
    ```

#### `POST /api/v1/resources`
Creates a resource scoped to the authenticated tenant.

- **Headers**:
  `Authorization: Bearer <API_KEY>`
- **Request Body**:
  ```json
  {
    "name": "Analytics Stream"
  }
  ```

#### Rate Limit Exceeded Response (429)
- **Status**: `429 Too Many Requests`
- **Headers**:
  - `X-RateLimit-Limit: 10`
  - `X-RateLimit-Remaining: 0`
  - `Retry-After: 42`
- **Body**:
  ```json
  {
    "error": "too many requests"
  }
  ```

---

## 🗄️ Database Schema

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255),
    revoked_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🚦 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) & Docker Compose

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/Sujal-chaudhary/Rate_Limited_SAAS_API.git
cd Rate_Limited_SAAS_API
npm install
```

### 3. Environment Configuration
Copy `.env.sample` to `.env` and set your credentials:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ratelimit
REDIS_URL=redis://localhost:6379
```

### 4. Start Infrastructure Containers
Start local PostgreSQL and Redis containers:
```bash
docker run -d --name redis-dev -p 6379:6379 redis:alpine
docker run -d --name rate-limit-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ratelimit postgres:15
```

> **Windows Note**: If local Windows PostgreSQL services occupy port 5432, stop them first:
> ```powershell
> Stop-Service -Name "postgresql-x64-18"
> ```

### 5. Run Database Migrations
Apply database schema:
```bash
node src/migrations/run.js
```

### 6. Start the Application
```bash
npm start
# Server runs on http://localhost:3000
```

---

## 🔄 Switching Rate Limiting Algorithms

In `src/routes/resources.js`, choose which algorithm middleware to mount:

```javascript
// Option 1: Fixed Window Limiter
import rateLimiter from '../middleware/rateLimiter.js';

// Option 2: Sliding Window Log (Sorted Set)
import rateLimiter from '../middleware/slidingWindowLimiter.js';

// Option 3: Token Bucket (Redis Hash + Lua script)
import rateLimiter from '../middleware/TokenBucket.js';

router.use(auth, rateLimiter);
```

---

## 📜 Project 4: Distributed Background Jobs with BullMQ (Completed ✅)

- **Architecture**: Decoupled Producer/Consumer workers running on isolated Redis namespaces (`defaultPrefix: 'bull'`).
- **Repeatable Usage Flushing**: Background worker processes `usage-flush` queue every interval, aggregating in-memory token bucket counters and updating PostgreSQL via atomic UPSERT (`ON CONFLICT (tenant_id, window_start) DO UPDATE`).
- **Quota Notification & Deduplication**: Real-time evaluation triggers `quota-notify` queue at 80% & 100% capacity. Implements **dual-layer deduplication** (producer-side deterministic BullMQ `jobId` + consumer-side PostgreSQL `UNIQUE(tenant_id, threshold, sent_date)` with `ON CONFLICT DO NOTHING`) to guarantee zero duplicate alerts.
- **Resilience & Stall Recovery**: Configured 3-tier exponential backoff retries, persistent Dead-Letter Queue (DLQ) logging to `failed_jobs` table with complete JSON payloads, and verified Redis lock heartbeat stall recovery.
- **Monitoring & Metrics**: Live health inspection endpoint (`GET /api/v1/admin/status`) reporting concurrent queue depths across waiting, active, completed, failed, and delayed states.

---

## ⚡ Performance Benchmarks & Stress Testing

Benchmarked using [Autocannon](https://github.com/mcollina/autocannon) across high-concurrency scenarios:

| Metric | Measured Result | Impact |
|---|---|---|
| **Rate-Limiter Rejection Throughput** | **5,748+ req/sec** | Sustained Redis Lua script throughput under heavy burst pressure |
| **Rejection p99 Latency** | **< 7 ms** | Sub-millisecond distributed gateway throttling |
| **End-to-End Authenticated Throughput** | **~1,000–1,360+ req/sec** | Full roundtrip (SHA-256 Auth + Redis Lua Token Bucket + PostgreSQL Query) |
| **Connection Pool Tuning** | **p50 Latency cut by 55%** (1.52s → 676ms) | Tuned `pg.Pool` (`max: 30`) and HTTP keep-alive sockets (`65s`/`66s`) |
| **Server Error Rate** | **0% (Zero 5xx errors)** | Rock-solid stability over 29,500+ continuous transactions under 50 concurrent clients |

---

## 💳 Project 5: Stripe Billing & Webhook Reliability System

- **Raw Body Signature Verification**: Express `express.raw({ type: 'application/json' })` mounted ahead of `express.json()` on `/api/v1/webhooks` ensuring unaltered byte buffer delivery for HMAC-SHA256 signature verification (`stripe.webhooks.constructEvent`). Rejects forged or missing signatures with `400 Bad Request`.
- **Atomic Transactional Idempotency**: All webhook mutations wrapped in an ACID PostgreSQL transaction with `INSERT INTO stripe_events (event_id, type) ON CONFLICT (event_id) DO NOTHING`. Skips duplicate executions and returns `200 { received: true }` so Stripe retries are satisfied without duplicate side-effects.
- **Out-of-Order Delivery Protection**: Detects and drops delayed out-of-order webhook events by comparing incoming `event.created` against PostgreSQL `subscriptions.last_event_created`.
- **Checkout Session API**: Authenticated tenants generate Stripe hosted checkout sessions (`POST /api/v1/billing/checkout`) linked via `client_reference_id` and `metadata.tenant_id`.

---

## 🩺 Production Health Probes & Graceful Shutdown

- **Liveness Probe (`GET /health`)**: Lightweight check verifying the Node.js event loop is unblocked and responsive.
- **Readiness Probe (`GET /ready`)**: Deep dependency inspection pinging PostgreSQL (`SELECT 1`) and Redis (`PING`). Returns `503 Service Unavailable` if dependencies are offline, preventing cloud load balancers from routing traffic to unready containers.
- **Graceful Shutdown (`SIGTERM` / `SIGINT`)**: Intercepts process termination signals, halts incoming connections (`server.close()`), finishes active in-flight requests, and drains PostgreSQL and Redis connection pools cleanly before exiting with `code 0`.

---

## 🧪 Automated Testing Suite

Tested natively using Node.js built-in test runner (`node:test`) and Supertest:

```bash
# Run all automated tests with spec reporter
npm test
```

Automated test cases verify:
1. Missing cryptographic webhook signature rejection (`400`)
2. Forged/invalid cryptographic webhook signature rejection (`400`)
3. Sequential duplicate event idempotency (`200 OK`, exactly 1 database write)
4. Concurrent race condition handling (`Promise.all` across 5 simultaneous webhooks, exactly 1 database write)
5. Out-of-order event ordering (stale event dropped, newer subscription state preserved)

