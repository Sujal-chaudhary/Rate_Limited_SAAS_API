import redis from '../config/redis.js'

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