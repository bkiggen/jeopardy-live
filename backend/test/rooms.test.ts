import { afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { rooms } from '../src/lib/rooms.js';
import { passHeader } from './setup.js';

describe('POST /api/rooms', () => {
  afterEach(() => rooms.reset());

  it('creates a room and returns a 4-char code', async () => {
    const res = await request(app).post('/api/rooms').set(passHeader);
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(typeof res.body.createdAt).toBe('number');
  });

  it('401s without passcode', async () => {
    const res = await request(app).post('/api/rooms');
    expect(res.status).toBe(401);
  });

  it('subsequent rooms get distinct codes', async () => {
    const a = await request(app).post('/api/rooms').set(passHeader);
    const b = await request(app).post('/api/rooms').set(passHeader);
    expect(a.body.code).not.toBe(b.body.code);
  });
});

describe('GET /api/rooms/:code', () => {
  afterEach(() => rooms.reset());

  it('returns 404 for an unknown code', async () => {
    const res = await request(app).get('/api/rooms/ZZZZ');
    expect(res.status).toBe(404);
  });

  it('returns metadata for a real room (no passcode required)', async () => {
    const room = rooms.create();
    const res = await request(app).get(`/api/rooms/${room.code}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      code: room.code,
      memberCount: 0,
      hostConnected: false,
    });
  });

  it('lookup is case-insensitive', async () => {
    const room = rooms.create();
    const res = await request(app).get(`/api/rooms/${room.code.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(room.code);
  });
});
