/* FLOW :-
 STEP 1 — Key generation (happens when tenant signs up):
  Your server runs:
    rawKey  = crypto.randomBytes(32).toString('hex')  // "sk_abc123"
    hash    = SHA-256(rawKey)                          // "a3f9b2..."
    INSERT INTO api_keys (tenant_id, key_hash, label)
    VALUES (tenant_uuid, "a3f9b2...", "Production")   ← hash goes to DB HERE
    
  Return rawKey to tenant → "sk_abc123"  (only time they ever see it)

AUTH FLOW:-
STEP 2 — First request (and every request after):
  Tenant sends: Bearer sk_abc123
  You hash it:  SHA-256("sk_abc123") = "a3f9b2..."
  DB lookup:    WHERE key_hash = "a3f9b2..."  → FOUND ✅ (it was already there)

*/

import crypto from 'crypto';
import pool from '../config/db.js';


const auth = async(req , res, next) => {
    
    //extract raw key from header
     const authHeader = req.headers['authorization'];
     if(!authHeader){
        return res.status(401).json({
            message: 'missing Api key'
        })
     };
    const rawKey = authHeader.split(' ')[1]; //strips "bearer "

     //hash it 
     const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

     //DB lookup
     const result = await pool.query('SELECT * FROM api_keys WHERE key_hash = $1', [keyHash]);
    
     //not found or revoked
     if(result.rows.length === 0 || result.rows[0].revoked_at !== null){
        return res.status(401).json({
             error: 'invalid or revoked key'
        })
     };

      const tenantId = result.rows[0].tenant_id;

      const planResult = await pool.query('SELECT plan FROM tenants WHERE id = $1',[tenantId]);


     //attch to req
     req.user = {tenant_id: tenantId, plan: planResult.rows[0].plan};

     next();

};

export default auth;



