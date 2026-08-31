import { Router } from 'express';
import { createTenant } from '../controllers/tenantController.js';

const router = Router();

router.post('/', createTenant);

export default router;

