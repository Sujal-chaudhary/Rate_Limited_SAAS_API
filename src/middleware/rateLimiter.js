import redis from "../config/redis.js";

const rateLimiter = async (req, res, next) => {
    const userId = req.user.tenant_id;
    const plan = req.user.plan;
    const windowSize = 60;
    const windowStart = Math.floor((Date.now() / 1000) / windowSize) * windowSize;

    const key = `rate:${userId}:${windowStart}`; //key for fixed window

   // real logic
    const PLANS = {
      free: 10,
      pro: 100,
      enterprise: 500
    }

    const LIMIT = PLANS[plan] ?? 10;
   
   await redis.set(key, 0, 'EX', windowSize, 'NX');// atomic init with TTL
   const count =  await redis.incr(key);
    
   //tell the user everytime
    res.set('X-RateLimit-Limit', LIMIT); //this is the way we set header and it value
    res.set('X-RateLimit-Remaining', Math.max(0,LIMIT - count));
   
  if(count > LIMIT){
   const ttl = await redis.ttl(key);
     return res
     .set('Retry-After',ttl) 
     .status(429)
     .json({
        error: 'too many requests'
     })
   };

  
   next();

};

export default rateLimiter;