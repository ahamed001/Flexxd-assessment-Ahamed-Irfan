import { Router } from 'express';
import userRoutes from '../users/route/user.route.js';
import bookingRoutes from '../bookings/route/booking.route.js';

const router = Router();

router.use('/users', userRoutes);
router.use('/bookings', bookingRoutes);

export default router;
