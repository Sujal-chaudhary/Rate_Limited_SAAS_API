/* 
Builds Express, registers middlewares and routes, and exports app (no app.listen). */


import express from 'express';
import tenantRouter from './routes/tenants.js';
import keyRouter from './routes/keys.js';
import resourcesRouter from './routes/resources.js';
import adminRouter from './routes/admin.js';
import webhookRouter from './routes/webhooks.js';
import billingRouter from './routes/billing.js';
import healthRouter from './routes/health.js';

const app = express();

//for stripe webhook as it must receive raw buffer for sign verifucation 
app.use(
  '/api/v1/webhooks',
  express.raw({ type: 'application/json' }),
  webhookRouter
);

//MW(Global JSON parser for all other standard endpoints (keys, tenants, resources, )
app.use(express.json());


//route decleration:-
app.use('/api/v1/tenants', tenantRouter);
app.use('/api/v1/keys', keyRouter);
app.use('/api/v1/resources',resourcesRouter);
app.use('/api/v1/admin',adminRouter);
app.use('/api/v1/billing', billingRouter);

// Health probes (mounted at root /health and /ready for cloud orchestrators)
app.use('/', healthRouter);

export default app;

