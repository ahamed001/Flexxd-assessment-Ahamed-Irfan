import { Router } from 'express';
import { createBooking, redeemBooking } from '../controller/booking.controller.js';

const router = Router();

router.post('/', createBooking);
router.post('/redeem', redeemBooking);

export default router;
