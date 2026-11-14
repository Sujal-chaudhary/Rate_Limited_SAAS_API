import { usageFlushQueue } from './queues/usageFlushQueue.js';

console.log('Enqueuing flush job...');
//this is how we add jobs
await usageFlushQueue.add('manual-flush', {});

console.log('Job enqueued successfully');

process.exit(0);
