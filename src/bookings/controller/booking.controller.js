import * as bookingService from '../service/booking.service.js';
import { sendSuccess } from '../../utils/response.js';

export const createBooking = (req, res, next) => {
  try {
    const booking = bookingService.createBooking(req.body);
    return sendSuccess(res, 201, 'Booking created successfully', booking);
  } catch (error) {
    next(error);
  }
};

export const redeemBooking = (req, res, next) => {
  try {
    const booking = bookingService.redeemBooking(req.body);
    return sendSuccess(res, 200, 'Booking redeemed successfully', booking);
  } catch (error) {
    next(error);
  }
};
