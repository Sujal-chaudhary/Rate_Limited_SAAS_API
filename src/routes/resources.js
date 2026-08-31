import {Router}  from 'express';
import auth from '../middleware/auth.js';
import { createResources, getResources } from '../controllers/resourceController.js';
import rateLimiter from '../middleware/rateLimiter.js';

const router = Router();

router.post('/', auth,rateLimiter, createResources);

router.get('/', auth, rateLimiter, getResources);

export default router;