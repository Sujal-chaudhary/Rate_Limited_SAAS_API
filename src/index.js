import express from 'express';
import tenantRouter from './routes/tenants.js';
import keyRouter from './routes/keys.js';
import resourcesRouter from './routes/resources.js';

const app = express();

//MW
app.use(express.json());

//server start
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

/* 
app.get('/api/data',auth, rateLimiter, (req, res) => {
    res.json({ message: "success" });
}); */


//route decleration:-
app.use('/api/v1/tenants', tenantRouter);
app.use('/api/v1/keys', keyRouter);
app.use('/api/v1/resources',resourcesRouter);

