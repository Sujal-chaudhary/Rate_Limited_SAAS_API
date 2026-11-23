import app from "./app.js";
import pool from "./config/db.js";
import redis from "./config/redis.js";
// just keep app.listen

//server start
const PORT = 3000;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Prevent ECONNRESET during heavy load testing
   server.keepAliveTimeout = 65000;
   server.headersTimeout = 66000;

/* 
app.get('/api/data',auth, rateLimiter, (req, res) => {
    res.json({ message: "success" });
}); */

//Graceful Shutdown:- (When the OS tells Node to stop (SIGTERM on cloud, or SIGINT when you press Ctrl+C locally))

const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new HTTP requests
  server.close(async () => {
    console.log('HTTP server closed. Finishing in-flight requests...');

    try {
      // 2. Close Database Pool
      await pool.end();
      console.log('PostgreSQL pool drained and closed.');

      // 3. Close Redis Connection
      await redis.quit();
      console.log('Redis connection closed.');

      console.log('Graceful shutdown complete. Exiting cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown cleanup:', err);
      process.exit(1);
    }
  });

  // Force shutdown if cleanup takes too long (e.g. 10s timeout)
  setTimeout(() => {
    console.error('Forced shutdown: cleanup took too long.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));


