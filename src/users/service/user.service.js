import { users, bookings } from '../../data/store.js';
import { ApiError } from '../../utils/apiError.js';

export const getUserWithBookings = (id) => {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new ApiError(400, 'A valid user ID is required');
  }

  const user = users.find((u) => u.id === id.trim());
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const userBookings = bookings.filter((b) => b.userId === user.id);

  return { ...user, bookings: userBookings };
};
