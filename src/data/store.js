// Central in-memory storage. Data resets every time the server restarts.

const seedUsers = [
  { id: 'user_1', name: 'Aisha Khan', visitCredits: 3 },
  { id: 'user_2', name: 'Ben Carter', visitCredits: 0 },
];

const seedVenues = [
  { id: 'venue_1', name: 'Iron Peak Gym', pricePerVisit: 15, dailyCapacity: 2 },
  { id: 'venue_2', name: 'Flow Yoga Studio', pricePerVisit: 20, dailyCapacity: 10 },
];

export const users = [];
export const venues = [];
export const bookings = [];

// Restores the seed data. Arrays are refilled in place (not reassigned)
// so every module that imported them keeps pointing at the same arrays.
export const resetStore = () => {
  users.splice(0, users.length, ...seedUsers.map((u) => ({ ...u })));
  venues.splice(0, venues.length, ...seedVenues.map((v) => ({ ...v })));
  bookings.length = 0;
};

resetStore();
