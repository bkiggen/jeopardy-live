import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { TEST_PREFIX, getTestTeamId, passHeader } from './setup.js';

describe('GET /api/seasons', () => {
  it('returns seasons newest first', async () => {
    const res = await request(app).get('/api/seasons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('isActive');
  });
});

describe('GET /api/seasons/:id/scores', () => {
  it('returns leaderboard sorted by score desc', async () => {
    const active = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    const res = await request(app).get(
      `/api/seasons/${active.id}/scores?teamId=${getTestTeamId()}`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 1) {
      for (let i = 1; i < res.body.length; i += 1) {
        expect(res.body[i - 1].totalScore).toBeGreaterThanOrEqual(res.body[i].totalScore);
      }
    }
  });

  it('400s on a non-numeric id', async () => {
    const res = await request(app).get(
      `/api/seasons/not-a-number/scores?teamId=${getTestTeamId()}`,
    );
    expect(res.status).toBe(400);
  });

  it('400s without teamId', async () => {
    const active = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    const res = await request(app).get(`/api/seasons/${active.id}/scores`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/seasons', () => {
  it('creates a new active season and deactivates the previous one', async () => {
    const before = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    const name = `${TEST_PREFIX}${Date.now().toString(36)}`;
    try {
      const res = await request(app)
        .post('/api/seasons')
        .set(passHeader)
        .send({ name });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name, isActive: true });

      const stillActive = await prisma.season.findUnique({ where: { id: before.id } });
      expect(stillActive?.isActive).toBe(false);
    } finally {
      // Restore prior active state for downstream tests.
      await prisma.season.updateMany({
        where: { name: { startsWith: TEST_PREFIX } },
        data: { isActive: false },
      });
      await prisma.season.update({
        where: { id: before.id },
        data: { isActive: true, endDate: null },
      });
    }
  });

  it('401s without passcode', async () => {
    const res = await request(app).post('/api/seasons').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});
