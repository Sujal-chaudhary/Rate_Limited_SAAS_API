import { Router } from 'express';
import { getQueueStatus } from '../controllers/adminController.js';

const router = Router();

router.get('/status',getQueueStatus)

export default router;