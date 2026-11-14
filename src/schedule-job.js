import {usageFlushQueue} from "./queues/usageFlushQueue.js";

// console.log('Registering recurring flush schedule...');
/* 
//1. for usage-flush jobs:-
await usageFlushQueue.upsertJobScheduler(
  'flush-every-10s', //id

  {
    every: 10000 // every 10 seconds
  },
  
  {
    name: 'recurring-flush', //name of the job
    data: {},   // payload for handler
    opts: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000 // 1s base delay: 1st retry in 1s, 2nd retry in 2s
        }
    }
  }
); 



console.log('Recurring flush scheduler registered: runs every 10 seconds!');
process.exit(0);

 */
console.log("Removing recurring flush scheduler...");

await usageFlushQueue.removeJobScheduler('flush-every-10s');

console.log("successfully removed");
await usageFlushQueue.close()
process.exit(0);
