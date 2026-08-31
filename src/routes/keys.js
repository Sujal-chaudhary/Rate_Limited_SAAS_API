import {Router} from 'express';
import { createKey, revokeKey } from '../controllers/keyController.js';
import auth from '../middleware/auth.js';


const router = Router();


router.post('/', createKey);
router.patch('/:id/revoke',auth ,revokeKey);

export default router;