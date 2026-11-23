import express from 'express';
import auth from '../middleware/auth.js';
import { createCheckoutSession } from '../controllers/billingController.js';

const router = express.Router();

router.post('/checkout', auth, createCheckoutSession);

export default router;
