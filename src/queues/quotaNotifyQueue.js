import { Queue } from "bullmq";
import { redisConnection, defaultPrefix } from '../config/bullmq.js';

const quotaNotifyQueue = new Queue('quota-notify',{
     connection: redisConnection,
     prefix: defaultPrefix,
});

export default quotaNotifyQueue;
