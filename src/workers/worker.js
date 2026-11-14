import { Worker } from "bullmq";
import { redisConnection, defaultPrefix } from "../config/bullmq.js";
import flushHandler from "./handlers/usageFlushHandler.js";
import pool from "../config/db.js";
import quotaNotifyHandler from "./handlers/quotaNotifyHandler.js";


console.log("worker is running...");

const options = {
    connection: redisConnection,
    prefix: defaultPrefix
}
const worker = new Worker('usage-flush', flushHandler, options);

const SecondWorker = new Worker('quota-notify', quotaNotifyHandler, options)




//Observability: Event Listeners
//BullMQ workers emit events so you can monitor what's happening

worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed!`);
});


worker.on('failed', async (job, err) => {
  const time = new Date().toLocaleTimeString();
  if (job.attemptsMade < job.opts.attempts) {
    console.warn(`[${time}] ⚠️ Attempt ${job.attemptsMade}/${job.opts.attempts} failed: ${err.message}. Waiting for backoff...`);
  } else {
    console.error(`[${time}] ❌ Job ${job.id} permanently failed after ${job.attemptsMade} attempts!`);
     
    //insertion made for permanent failed jobs
     await pool.query(
      `INSERT INTO failed_jobs (job_id, queue_name, tenant_id, error_message, job_data, attempts_made)
       VALUES ($1, $2, $3, $4, $5, $6)`,
       [job.id, job.queueName,job.data?.tenant_id || null,err.message,job.data,job.attemptsMade]
    );
    
    console.log(`[DLQ] Job ${job.id} recorded in failed_jobs table`);

  }
});

//second worker listener:
SecondWorker.on('completed',(job) => {
  console.log(`[quota-notify] job ${job.id} completed!`);
});

SecondWorker.on('failed', async(job, err) => {
   const time = new Date().toLocaleTimeString();
  if (job.attemptsMade < job.opts.attempts) {
    console.warn(`[${time}] ⚠️ Attempt ${job.attemptsMade}/${job.opts.attempts} failed: ${err.message}. Waiting for backoff...`);
  } else {
    console.error(`[${time}] ❌ Job ${job.id} permanently failed after ${job.attemptsMade} attempts!`);
     
    //insertion made for permanent failed jobs
     await pool.query(
      `INSERT INTO failed_jobs (job_id, queue_name, tenant_id, error_message, job_data, attempts_made)
       VALUES ($1, $2, $3, $4, $5, $6)`,
       [job.id, job.queueName,job.data?.tenant_id || null,err.message,job.data,job.attemptsMade]
    );
    
    console.log(`[DLQ] Job ${job.id} recorded in failed_jobs table`);

  }
});
