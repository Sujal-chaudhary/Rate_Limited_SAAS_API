import { Queue } from 'bullmq';
import { redisConnection, defaultPrefix } from '../config/bullmq.js';

const usageFlushQueue = new Queue(
    'usage-flush',
    {
         connection: redisConnection,
         prefix: defaultPrefix,
    }
);

export default usageFlushQueue;
