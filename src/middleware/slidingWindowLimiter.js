import redis from '../config/redis.js';

const rateLimiter = async(req , res, next) => {
    const userId = req.user.tenant_id;
    const plan = req.user.plan;
    const windowSize = 60; //sec
    const now = Date.now(); //ms bcz ZADD stores timestamops in ms
    const windowStart = now - (windowSize * 1000);

    const key = `rate:${userId}`; //for sliding window

   //logic
    const PLANS = {
      free: 10,
      pro: 100,
      enterprise: 500
    }

    const LIMIT = PLANS[plan] ?? 10;

    const multi = redis.multi(); // start recoding commands, creating a pipeline
    multi.zremrangebyscore(key, 0, windowStart)      // queued
    multi.zadd(key, now, `${now}-${Math.random()}`)                  // queued
    multi.zcard(key)                 // queued
    multi.expire(key, windowSize)                // queued
    const results = await multi.exec(); // "send ALL at once" — atomic oper
    
    const count = results[2][1]; //results[2] is an array [null, 1]
    //tell the user everytime
    res.set('X-RateLimit-Limit', LIMIT); //this is the way we set header and it value
    res.set('X-RateLimit-Remaining', Math.max(0,LIMIT - count));

    if(count > LIMIT){
        const ttl  = await redis.ttl(key);
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

/* 
Sliding Window View at 12:01:05:
            Cutoff (12:00:05)                              Now (12:01:05)
                     | <--------- 60s Window -------------> |
---------------------|-----------[12:00:55]-----------------[12:01:05]--->
                     |           (10 requests)              (1 request)
                                Total in window = 11 -> BLOCKED!


*/