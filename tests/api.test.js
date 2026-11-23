import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { users, venues, bookings, resetStore } from '../src/data/store.js';

let server;
let baseUrl;

// Start the app on a random free port (0) once for the whole file.
before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

// Every test starts from the same seed data.
beforeEach(() => resetStore());

const post = async (path, body) => {
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const get = async (path) => {
  const res = await fetch(baseUrl + path);
  return { status: res.status, body: await res.json() };
};

const book = (userId, venueId) => post('/bookings', { userId, venueId });

const redeem = (booking) =>
  post('/bookings/redeem', {
    redemptionCode: booking.redemptionCode,
    userId: booking.userId,
    venueId: booking.venueId,
  });

const credits = (userId) => users.find((u) => u.id === userId).visitCredits;

describe('POST /bookings', () => {
  test('creates a booking and deducts exactly one credit', async () => {
    const res = await book('user_1', 'venue_1');

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.userId, 'user_1');
    assert.equal(res.body.data.venueId, 'venue_1');
    assert.equal(res.body.data.status, 'booked');
    assert.equal(res.body.data.redeemedAt, null);
    assert.match(res.body.data.redemptionCode, /^FXD-[A-Z0-9]{6}$/);
    assert.equal(credits('user_1'), 2);
    assert.equal(bookings.length, 1);
  });

  test('returns 404 for a nonexistent user', async () => {
    const res = await book('nope', 'venue_1');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { success: false, message: 'User not found' });
    assert.equal(bookings.length, 0);
  });

  test('returns 404 for a nonexistent venue and does not deduct credits', async () => {
    const res = await book('user_1', 'nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.message, 'Venue not found');
    assert.equal(credits('user_1'), 3);
    assert.equal(bookings.length, 0);
  });

  test('returns 400 for insufficient credits', async () => {
    const res = await book('user_2', 'venue_2');
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Insufficient visit credits');
    assert.equal(credits('user_2'), 0);
    assert.equal(bookings.length, 0);
  });

  test('returns 400 for invalid payloads', async () => {
    for (const payload of [{}, { userId: 'user_1' }, { userId: 1, venueId: 'venue_1' }, { userId: ' ', venueId: 'venue_1' }]) {
      const res = await post('/bookings', payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.equal(res.body.success, false);
    }
    assert.equal(credits('user_1'), 3);
  });

  test('returns 400 for malformed JSON', async () => {
    const res = await fetch(baseUrl + '/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).success, false);
  });

  test('enforces daily capacity without deducting credits on rejection', async () => {
    // venue_1 has dailyCapacity 2
    assert.equal((await book('user_1', 'venue_1')).status, 201);
    assert.equal((await book('user_1', 'venue_1')).status, 201);

    const res = await book('user_1', 'venue_1');
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'Venue has reached its daily booking capacity');
    assert.equal(credits('user_1'), 1); // only the 2 successful bookings cost credits
    assert.equal(bookings.length, 2);
  });

  test('redeemed bookings still count towards capacity', async () => {
    const first = await book('user_1', 'venue_1');
    await redeem(first.body.data);
    await book('user_1', 'venue_1');

    assert.equal((await book('user_1', 'venue_1')).status, 409);
  });

  test("bookings from a previous day do not count towards today's capacity", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    for (const code of ['FXD-AAAAAA', 'FXD-BBBBBB']) {
      bookings.push({
        id: code, userId: 'user_2', venueId: 'venue_1', redemptionCode: code,
        status: 'booked', createdAt: yesterday, redeemedAt: null,
      });
    }

    assert.equal((await book('user_1', 'venue_1')).status, 201);
  });

  test('redemption codes are unique across many bookings', async () => {
    users[0].visitCredits = 200;
    venues[1].dailyCapacity = 200;

    const codes = [];
    for (let i = 0; i < 200; i++) {
      codes.push((await book('user_1', 'venue_2')).body.data.redemptionCode);
    }

    assert.equal(new Set(codes).size, 200);
    assert.equal(credits('user_1'), 0);
  });
});

describe('POST /bookings/redeem', () => {
  test('redeems a booking and records the timestamp', async () => {
    const created = (await book('user_1', 'venue_1')).body.data;
    const res = await redeem(created);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, created.id);
    assert.equal(res.body.data.status, 'redeemed');
    assert.ok(!Number.isNaN(Date.parse(res.body.data.redeemedAt)));
    assert.ok(res.body.data.redeemedAt >= created.createdAt);

    // Stored record updated, no new booking created, credits unchanged
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0].status, 'redeemed');
    assert.equal(credits('user_1'), 2);
  });

  test('accepts a lowercase code', async () => {
    const created = (await book('user_1', 'venue_1')).body.data;
    const res = await redeem({ ...created, redemptionCode: created.redemptionCode.toLowerCase() });
    assert.equal(res.status, 200);
  });

  test('rejects a second redemption and keeps the original timestamp', async () => {
    const created = (await book('user_1', 'venue_1')).body.data;
    const first = await redeem(created);
    const second = await redeem(created);

    assert.equal(second.status, 409);
    assert.equal(second.body.message, 'Booking has already been redeemed');
    assert.equal(bookings[0].redeemedAt, first.body.data.redeemedAt);
  });

  test('only one of several simultaneous redemptions succeeds', async () => {
    const created = (await book('user_1', 'venue_1')).body.data;
    const results = await Promise.all(Array.from({ length: 5 }, () => redeem(created)));
    const statuses = results.map((r) => r.status).sort();

    assert.deepEqual(statuses, [200, 409, 409, 409, 409]);
    assert.equal(bookings.length, 1);
  });

  test('returns 400 for a malformed code', async () => {
    const res = await post('/bookings/redeem', { redemptionCode: 'ABC', userId: 'user_1', venueId: 'venue_1' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('returns 404 for a well-formed but unknown code', async () => {
    const res = await post('/bookings/redeem', { redemptionCode: 'FXD-ZZZZZZ', userId: 'user_1', venueId: 'venue_1' });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, 'Redemption code not found');
  });

  test('returns 400 for missing fields', async () => {
    const res = await post('/bookings/redeem', { redemptionCode: 'FXD-ZZZZZZ' });
    assert.equal(res.status, 400);
  });

  test('rejects a code used by the wrong user or venue without changing the booking', async () => {
    const created = (await book('user_1', 'venue_1')).body.data;

    const wrongUser = await redeem({ ...created, userId: 'user_2' });
    const wrongVenue = await redeem({ ...created, venueId: 'venue_2' });

    assert.equal(wrongUser.status, 400);
    assert.equal(wrongVenue.status, 400);
    assert.equal(bookings[0].status, 'booked');
    assert.equal(bookings[0].redeemedAt, null);

    // The real owner can still redeem it afterwards
    assert.equal((await redeem(created)).status, 200);
  });
});

describe('GET /users/:id', () => {
  test('returns the user with current credits and booking history', async () => {
    const a = (await book('user_1', 'venue_1')).body.data;
    const b = (await book('user_1', 'venue_2')).body.data;
    await redeem(a);

    const res = await get('/users/user_1');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, 'user_1');
    assert.equal(res.body.data.visitCredits, 1);

    // History must match the stored records exactly
    const stored = bookings.filter((x) => x.userId === 'user_1');
    assert.deepEqual(res.body.data.bookings, stored);
    assert.deepEqual(res.body.data.bookings.map((x) => x.id), [a.id, b.id]);
    assert.equal(res.body.data.bookings[0].status, 'redeemed');
  });

  test('returns an empty history for a user with no bookings', async () => {
    const res = await get('/users/user_2');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.bookings, []);
  });

  test('does not include other users\' bookings', async () => {
    await book('user_1', 'venue_1');
    const res = await get('/users/user_2');
    assert.deepEqual(res.body.data.bookings, []);
  });

  test('returns 404 for a nonexistent user', async () => {
    const res = await get('/users/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { success: false, message: 'User not found' });
  });
});

describe('General', () => {
  test('GET /health returns ok', async () => {
    const res = await get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test('unknown routes return 404 in the standard format', async () => {
    const res = await get('/venues');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });
});
