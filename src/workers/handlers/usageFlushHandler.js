import redis from '../../config/redis.js';
import pool from '../../config/db.js';
/* 
const flushHandler = async(job) => {
    throw new Error('Simulated permanent failure for DLQ test'); // ← just this line
} */
 
//const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const flushHandler = async(job) => {

     //for stall simulation:-
    //console.log(`[stall-test] Job ${job.id} started — sleeping 25 seconds...`);
    //await sleep(25000); // gives us 25s to kill the process
    
    const keys = await redis.keys('token_bucket:*'); // array of keys
    if(keys.length === 0){
       console.log('No keys to flush');
        return { flushed: 0 };
       }

      //if we have then loop thorugh
      for(const key of keys){
      const tenantId = key.replace('token_bucket:', '');
      const data = await redis.hgetall(key); //reading bcuekt data
      
      if (!data || !data.tokens) continue;

      const tokensRemaining = parseFloat(data.tokens);
      const lastRefilled = parseInt(data.last_refilled, 10)

      const windowStart = new Date(Math.floor(lastRefilled / 60000) * 60000);

      const tenantRes = await pool.query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
         if (tenantRes.rows.length === 0) continue;
          const plan = tenantRes.rows[0].plan;

          const PLANS = { free: 10, pro: 100, enterprise: 500 };      
          const capacity = PLANS[plan] || 10;
          const requestCount = Math.max(0, Math.round(capacity - tokensRemaining));    
              
          const result = await pool.query
          (`INSERT INTO usage (tenant_id, window_start, request_count, tokens_remaining ,flushed_at, job_id)
             VALUES ($1, $2, $3, $4, now(), $5) 
             ON CONFLICT (tenant_id, window_start) 
             DO UPDATE SET 
                request_count    = EXCLUDED.request_count,
                tokens_remaining = EXCLUDED.tokens_remaining,
                flushed_at       = now(),
                job_id         = EXCLUDED.job_id`,
              [tenantId, windowStart, requestCount, tokensRemaining, job.id] 
          )
       
    };

     console.log(`[usage-flush] Job ${job.id} completed`);
     return { success: true };

};


export default flushHandler;

/* UPdate + inSERT = UPSERT (concepts of idempotency)

INSERT INTO usage (...)          -- tries to insert first
VALUES (...)
ON CONFLICT (tenant_id, window_start)   -- if row already exists...
DO UPDATE SET                    -- ...switch to update instead
  request_count = EXCLUDED.request_count,
  ...

  If the row does NOT exist  →  INSERT it  (normal insert)
  If the row DOES exist      →  UPDATE it  (update instead of crashing)
 
*/