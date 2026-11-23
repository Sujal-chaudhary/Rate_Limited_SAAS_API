import redis from '../config/redis.js'
import quotaNotifyQueue from '../queues/quotaNotifyQueue.js';

const luaScript = `
  local key        = KEYS[1]
  local capacity   = tonumber(ARGV[1])
  local refillRate = tonumber(ARGV[2])
  local now        = tonumber(ARGV[3])

  -- Step 1: Read current state from Redis
  local data = redis.call('HMGET', key, 'tokens', 'last_refilled')
  local tokens       = tonumber(data[1])
  local lastRefilled = tonumber(data[2])

  -- Step 2: First request ever? Start with full bucket
  if tokens == nil then
    tokens = capacity
    lastRefilled = now
  end

  -- Step 3 & 4: Calculate elapsed time and refill tokens
  local delta     = (now - lastRefilled) / 1000  -- convert ms → seconds
  local newTokens = delta * refillRate

  -- Step 5: Add tokens but cap at capacity
  tokens = math.min(capacity, tokens + newTokens)

  -- Step 6 & 7: Consume token or deny
  if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refilled', now)
    redis.call('EXPIRE', key, 3600)  -- auto-cleanup after 1hr idle
    return {1, math.floor(tokens)}  -- allowed, tokens remaining
  else
    return {0, 0}  -- denied
  end
`;



const rateLimiter = async(req , res, next) => {
       const userId = req.user.tenant_id;
       const plan = req.user.plan;
       const now = Date.now();
       const key = `token_bucket:${userId}`
      

       const PLANS = {
        free: { capacity: 10, refillRate: 10/60 },  // 10 tokens/min
        pro:  { capacity: 100, refillRate: 100/60 },
        enterprise: { capacity: 500, refillRate: 500/60 }
     };

     const { capacity, refillRate } = PLANS[plan] ?? PLANS.free;

     try {
        const result = await redis.eval(luaScript, 1, key, capacity, refillRate, now);

         const allowed = result[0];
         const tokensLeft = result[1]

     //set header
     res.set('X-RateLimit-Limit',capacity);
     res.set('X-RateLimit-Remaining',tokensLeft);

     //JOB QUEUE SETUP:(PRODUCER)
     if (tokensLeft <= capacity * 0.2) {
         const threshold = tokensLeft === 0 ? 100 : 80;
         const today = new Date().toISOString().split('T')[0];
         const jobId = `quota_${userId}_${threshold}_${today}`; // it should not contain colons
      
         quotaNotifyQueue.add(
           'notify',
           {tenantId: userId, threshold}, //data
           {
            jobId, //bullMQ drops duplicate jobs with same jobId so now no spamming can happen to user
            attempts:3,
            backoff:{type: 'exponential', delay: 1000}
           }
         ).catch(err => console.error('failed to enqueue quota notify job: ',err));
      };

     if(allowed === 1){
        next()
     }
     else{
        return res
        .status(429)
        .json({
            error: 'too many requests' 
        })
     }
        
     } catch (error) {
        console.error(error)
        return res.status(500).json({
            message: 'internal server error'
        })
     }

     
};


export default rateLimiter;


/* 
Now: The Producer Dedupe (jobId)

Remember earlier when you correctly said:

"at 81, 82, 83... it will notify the user again and again"

Here is where BullMQ's jobId deduplication shines!
When we add a job to BullMQ, if we give it a specific jobId, 
BullMQ refuses to enqueue a second job with that same ID while one is pending or active.

*/