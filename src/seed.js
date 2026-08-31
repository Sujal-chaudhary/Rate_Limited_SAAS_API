import crypto from 'crypto';
import pool from './config/db.js';

// 1. Generate a random raw key (this is what the tenant receives)
const rawKey = crypto.randomBytes(32).toString('hex');

// 2. Hash it (this is what gets stored in DB)
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

// 3. Insert tenant + api_key
const client = await pool.connect();
try {
    await client.query('BEGIN');

    const tenantResult = await client.query(
        `INSERT INTO tenants (name, plan) VALUES ($1, $2) RETURNING id`,
        ['Test Tenant', 'free']
    );
    const tenantId = tenantResult.rows[0].id;

    await client.query(
        `INSERT INTO api_keys (tenant_id, key_hash, label) VALUES ($1, $2, $3)`,
        [tenantId, keyHash, 'Test Key']
    );

    await client.query('COMMIT');

    console.log(' Seed complete!\n');
    console.log('Tenant ID :', tenantId);
    console.log('Raw API Key:', rawKey);
    console.log('\n Copy this key — it will NOT be shown again.');
 
   // console.log(`curl -s -i -H "Authorization: Bearer ${rawKey}" http://localhost:3000/api/data`);

} catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
} finally {
    client.release();
    await pool.end();
}
