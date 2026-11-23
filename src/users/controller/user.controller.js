import * as userService from '../service/user.service.js';
import { sendSuccess } from '../../utils/response.js';

export const getUser = (req, res, next) => {
  try {
    const user = userService.getUserWithBookings(req.params.id);
    return sendSuccess(res, 200, 'User fetched successfully', user);
  } catch (error) {
    next(error);
  }
};
