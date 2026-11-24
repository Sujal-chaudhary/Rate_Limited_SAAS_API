import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import request  from 'supertest'; 
import app from '../app.js';
import stripe from '../config/stripe.js';
import pool from '../config/db.js';
import crypto from 'node:crypto';


// Helper to sign test payloads with the real HMAC secret
const signPayload = (payload) => {
  const rawBody = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return { rawBody, header };
};

//TEST 1:-
describe('Stripe webhook signature Verification & Idempotency', () => {
        
    after(async() => {
        await pool.end(); //close db pool so test runner exits cleanly
        await redis.quit();
        //give open sockets 200 ms to flush and exit cleanly
        setTimeout(() => process.exit(0), 200)
    })
    it('1. should reject with 400 if stripe signature header is missing', async() => {
        const payload = {id: 'test_123', type: 'checkout.session.completed'};

        const res = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(payload)); //sends raw data to server

        assert.equal(res.status, 400);
        assert.match(res.text, /webhook error/i);
    });

    it('2. should reject with 400 when stripe-signature is forged / invalid', async () => {
    const payload = { id: 'evt_test_123', type: 'checkout.session.completed' };
    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=12345,v1=fake_forged_signature_hash')
      .send(JSON.stringify(payload));

    assert.equal(res.status, 400);
    assert.match(res.text, /webhook error/i);
  });

    it('3.Sequential Duplicate: should process once and return 200 for duplicate', async() => {
        const eventId = `evt_seq_${Date.now()}`;
        const payload = {
            id: eventId,
            object: 'event',
           type: 'checkout.session.completed',
           created: Math.floor(Date.now() / 1000),
            data: { object: {} }
        };
       
        const {rawBody, header} = signPayload(payload);

        //first req
        const res1 = await request(app)
             .post('/api/v1/webhooks/stripe')
             .set('Content-Type', 'application/json')
             .set('stripe-signature', header)
             .send(rawBody);

            assert.equal(res1.status, 200);
            assert.deepEqual(res1.body, {received: true})

            // Second request (identical duplicate) -> Handled idempotently (200)
        const res2 = await request(app)
          .post('/api/v1/webhooks/stripe')
          .set('Content-Type', 'application/json')
           .set('stripe-signature', header)
           .send(rawBody);
         assert.equal(res2.status, 200);
         assert.deepEqual(res2.body, { received: true });
        
         //verifying our DB audit
         const checkdb = await pool.query(
            'SELECT COUNT(*) FROM stripe_events WHERE event_id = $1', [eventId]
         );
         assert.equal(checkdb.rows[0].count, '1')
    });

  it('4. Concurrent Duplicates: Promise.all sends 5 identical events simultaneously', async () => {
    const eventId = `evt_concurrent_${Date.now()}`;
    const payload = {
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: {} }
    };
    const { rawBody, header } = signPayload(payload);
    // Fire 5 requests in parallel to simulate high concurrency / network race
    const responses = await Promise.all([
      request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', header).send(rawBody),
      request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', header).send(rawBody),
      request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', header).send(rawBody),
      request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', header).send(rawBody),
      request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('stripe-signature', header).send(rawBody),
    ]);
    // All 5 must succeed with 200 to Stripe
    for (const res of responses) {
      assert.equal(res.status, 200);
    }
    // But Postgres ON CONFLICT ensures exactly ONE row is recorded
    const checkDb = await pool.query(
      'SELECT COUNT(*) FROM stripe_events WHERE event_id = $1',
      [eventId]
    );
    assert.equal(checkDb.rows[0].count, '1');
  });


 it('5. Out-of-order event: should ignore older event and keep newer state', async () => {
    const tenantId = crypto.randomUUID();
    const subId = `sub_test_${Date.now()}`;

    // Setup: Create tenant and an existing subscription with created timestamp = 2000
    await pool.query(
      `INSERT INTO tenants (id, name, plan) VALUES ($1, $2, 'pro')`,
      [tenantId, 'Test Tenant']
    );

    await pool.query(
      `INSERT INTO subscriptions (tenant_id, stripe_customer_id, stripe_subscription_id, status, plan, last_event_created)
       VALUES ($1, $2, $3, 'active', 'pro', 2000)`,
      [tenantId, 'cus_123', subId]
    );

    // Incoming stale event with created timestamp = 1000 (older than 2000)
    const stalePayload = {
      id: `evt_stale_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      created: 1000,
      data: {
        object: {
          id: subId,
          status: 'active',
          metadata: { plan: 'enterprise' }
        }
      }
    };

    const { rawBody, header } = signPayload(stalePayload);

    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(rawBody);

    assert.equal(res.status, 200);

    // Verify DB: Subscription should NOT have been overwritten by stale event
    const subCheck = await pool.query(
      'SELECT plan, last_event_created FROM subscriptions WHERE stripe_subscription_id = $1',
      [subId]
    );

    // Must still be 'pro' with timestamp 2000, NOT 'enterprise' with 1000!
    assert.equal(subCheck.rows[0].plan, 'pro');
    assert.equal(Number(subCheck.rows[0].last_event_created), 2000);
  });
});



