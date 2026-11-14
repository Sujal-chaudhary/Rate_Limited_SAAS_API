import { usageFlushQueue } from './queues/usageFlushQueue.js';

// 1. Ask BullMQ what repeatable schedules exist
const repeatable = await usageFlushQueue.getRepeatableJobs();
console.log('Repeatable schedules:', repeatable);

// 2. Ask BullMQ the count of jobs in each state (waiting, completed, delayed, failed)
const counts = await usageFlushQueue.getJobCounts();
console.log('Job counts:', counts);

process.exit(0);
