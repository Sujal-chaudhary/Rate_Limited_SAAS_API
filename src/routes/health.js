//exposes GET /health and GET /ready
import express from "express";
import pool from "../config/db.js";
import redis from "../config/redis.js";

const router = express.Router();

// 1. Liveness probe
router.get('/health', async(req , res) => {
    res.status(200).json({status:'ok', uptime: process.uptime() });
});

//2. readiness probe:
router.get('/ready', async(req , res) =>{
    try {
        //ping postgresSQL
        await pool.query('SELECT 1');

        //ping redis
        const redisPing = await redis.ping();
        if(redisPing !== 'PONG'){
            throw new Error('Redis ping failed')
        }

        return res.status(200).json({
            status: 'ready',
            database: 'connected',
            redis: 'connected'
        });
    } catch (error) {
        res.status(503).json({
            status: 'unready',
            error: error.message
        })
    }
});

export default router;