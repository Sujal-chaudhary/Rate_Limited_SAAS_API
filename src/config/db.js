import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    max: 30, // allow up to 60 simultaneous DB connections (default was 10)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export default pool;

/* 
idleTimeoutMillis: 30000 (Sending Tellers on Break When It's Quiet)

What it means: If a connection sits completely idle (nobody is running queries on it) for 30,000 ms (30 seconds), close it and release the memory back to PostgreSQL.
 
Why it matters:
  
During your 30-second benchmark, the pool opens up to 30 connections to handle the load.
But what happens at 2:00 AM when no one is using your app?
  
You don't want 30 idle connections holding memory in PostgreSQL forever. After 30 seconds of quiet, the pool shrinks itself down, saving RAM and server resources!

*/

/* 
connectionTimeoutMillis: 5000 (How Long a Customer Waits in Line Before Giving Up)

  

What it means: If all 30 connections are currently busy, and a new request comes in, wait up to 5,000 ms (5 seconds) for a connection to become free. If 5 seconds pass and no connection freed up 
→
→ throw an error.


  

  

  
Default value: 0 (which means wait forever!)

  
Why default 0 is dangerous in production:
  
  

  
If your database hangs or gets locked, and connectionTimeoutMillis is 0, incoming requests will wait in Node.js memory forever.

  
Your server runs out of RAM and crashes completely.

  
Setting this to 5000 means: "If the database is so overwhelmed that a connection can't free up in 5 seconds, fail fast so we don't freeze the entire Node.js event loop!"




*/