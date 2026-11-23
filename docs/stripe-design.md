# Stripe Webhook Handler: Architectural Design Decisions

## 1. Raw Body Handling
- **Problem**: Stripe verifies requests via HMAC-SHA256 of the raw payload bytes against the `Stripe-Signature` header. If `express.json()` parses the request first, the original byte stream is altered, corrupting the hash calculation and resulting in a 400 Bad Request error.
- **Decision**: Mount `express.raw({ type: 'application/json' })` strictly on `/api/v1/webhooks/stripe` BEFORE global or downstream JSON parsers. `req.body` will remain a raw Buffer, allowing `stripe.webhooks.constructEvent()` to verify the cryptographic signature accurately.

## 2. Idempotency & Concurrency
- **Problem**: Stripe guarantees at-least-once delivery. High-latency spikes or network retries can send the identical event concurrently. A naive `SELECT` then `INSERT` pattern suffers from a Time-Of-Check to Time-Of-Use (TOCTOU) race condition where both concurrent requests read "not found" and both execute writes.
- **Decision**: Rely on the PostgreSQL database engine as the atomic referee. Store incoming events in a dedicated `stripe_events` table with `PRIMARY KEY (event_id)`. Webhook processing initiates with:
  ```sql
  INSERT INTO stripe_events (event_id, type, received_at)
  VALUES ($1, $2, now())
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id;
  ```
  If no row returns, the event is recognized as a duplicate and immediately skipped with a `200 OK`.

## 3. Transaction Boundaries (ACID)
- **Problem**: If the webhook marks an event as processed, but the server crashes before applying the plan upgrade to the `tenants` or `subscriptions` table, the user never receives their paid tier, and retries will be mistakenly dropped as duplicates.
- **Decision**: Wrap event insertion and tenant plan adjustments inside a single PostgreSQL transaction (`BEGIN ... COMMIT`). If a failure or process interruption occurs anywhere in the pipeline, PostgreSQL rolls back the entire transaction. A subsequent Stripe retry can then cleanly process the event from scratch.

## 4. Out-of-Order Delivery
- **Problem**: Network routing delays can deliver an older subscription update after a newer subscription downgrade (e.g. `customer.subscription.updated` [downgrade to Free] arrives before `customer.subscription.updated` [upgrade to Pro]). Applying events strictly upon arrival risks overwriting newer states with older ones.
- **Decision**: Maintain a `last_event_created` (epoch timestamp) column in the `subscriptions` table. Compare incoming `event.created` against `last_event_created`. If `event.created <= last_event_created`, the payload is stale and ignored.

## 5. Postgres ↔ Redis Plan Synchronization
- **Problem**: The rate limiting middleware (Token Bucket) checks tenant quotas in Redis. When the database updates a tenant's plan from `free` to `pro`, the in-memory Redis token bucket may still restrict the client under old tier parameters until refreshed.
- **Decision**: Propagate plan updates directly to Redis upon successful transaction commit. To tolerate transient Redis downtime, back this operation with a BullMQ sync job with exponential retries and keep plan lookups grounded with a short TTL cache.
