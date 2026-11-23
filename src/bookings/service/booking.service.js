import { randomInt, randomUUID } from 'node:crypto';
import { users, venues, bookings } from '../../data/store.js';
import { ApiError } from '../../utils/apiError.js';

const CODE_PREFIX = 'FXD-';
const CODE_LENGTH = 6;
const CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_PATTERN = /^FXD-[A-Z0-9]{6}$/;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// Generates FXD-XXXXXX and retries until it doesn't match an existing booking's code.
const generateRedemptionCode = () => {
  let code;
  do {
    let suffix = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      suffix += CODE_CHARACTERS[randomInt(CODE_CHARACTERS.length)];
    }
    code = CODE_PREFIX + suffix;
  } while (bookings.some((b) => b.redemptionCode === code));

  return code;
};

// "YYYY-MM-DD" in UTC, so the daily window doesn't depend on the server's timezone.
const toUtcDay = (isoString) => isoString.slice(0, 10);

export const createBooking = ({ userId, venueId } = {}) => {
  // 1. Validate payload
  if (!isNonEmptyString(userId) || !isNonEmptyString(venueId)) {
    throw new ApiError(400, 'userId and venueId are required and must be non-empty strings');
  }

  // 2. Check user and venue exist
  const user = users.find((u) => u.id === userId.trim());
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const venue = venues.find((v) => v.id === venueId.trim());
  if (!venue) {
    throw new ApiError(404, 'Venue not found');
  }

  // 3. Check credits
  if (user.visitCredits < 1) {
    throw new ApiError(400, 'Insufficient visit credits');
  }

  // 4. Check today's capacity (redeemed bookings still hold their slot)
  const now = new Date().toISOString();
  const today = toUtcDay(now);
  const bookingsToday = bookings.filter(
    (b) => b.venueId === venue.id && toUtcDay(b.createdAt) === today
  ).length;

  if (bookingsToday >= venue.dailyCapacity) {
    throw new ApiError(409, 'Venue has reached its daily booking capacity');
  }

  // 5. All checks passed: change state. Everything here is synchronous,
  //    so no other request can run in between the checks and these updates.
  const booking = {
    id: randomUUID(),
    userId: user.id,
    venueId: venue.id,
    redemptionCode: generateRedemptionCode(),
    status: 'booked',
    createdAt: now,
    redeemedAt: null,
  };

  user.visitCredits -= 1;
  bookings.push(booking);

  return booking;
};

export const redeemBooking = ({ redemptionCode, userId, venueId } = {}) => {
  // 1. Validate payload
  if (!isNonEmptyString(redemptionCode) || !isNonEmptyString(userId) || !isNonEmptyString(venueId)) {
    throw new ApiError(400, 'redemptionCode, userId and venueId are required and must be non-empty strings');
  }

  const code = redemptionCode.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    throw new ApiError(400, 'Invalid redemption code format. Expected FXD-XXXXXX');
  }

  // 2. Find the booking
  const booking = bookings.find((b) => b.redemptionCode === code);
  if (!booking) {
    throw new ApiError(404, 'Redemption code not found');
  }

  // 3. Code must belong to this user at this venue.
  //    Checked before the status so a wrong user can't learn whether it was redeemed.
  if (booking.userId !== userId.trim() || booking.venueId !== venueId.trim()) {
    throw new ApiError(400, 'Redemption code does not match the provided user and venue');
  }

  // 4. Only once per booking
  if (booking.status === 'redeemed') {
    throw new ApiError(409, 'Booking has already been redeemed');
  }

  // 5. Mark as redeemed
  booking.status = 'redeemed';
  booking.redeemedAt = new Date().toISOString();

  return booking;
};
