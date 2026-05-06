import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { TEST_PREFIX, passHeader } from './setup.js';

const teamName = (suffix: string) => `${TEST_PREFIX}${suffix}-${Date.now()}`;

const createdTeamIds: number[] = [];

afterEach(async () => {
  if (createdTeamIds.length === 0) return;
  const players = await prisma.player.findMany({
    where: { teamId: { in: createdTeamIds } },
    select: { id: true },
  });
  const playerIds = players.map((p) => p.id);
  if (playerIds.length) {
    await prisma.seasonScore.deleteMany({ where: { playerId: { in: playerIds } } });
  }
  await prisma.seasonScore.deleteMany({ where: { teamId: { in: createdTeamIds } } });
  await prisma.player.deleteMany({ where: { teamId: { in: createdTeamIds } } });
  await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
  createdTeamIds.length = 0;
});

describe('POST /api/teams', () => {
  it('creates a team and auto-generates a code', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('engineering') });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(res.body.isActive).toBe(true);
    createdTeamIds.push(res.body.id);
  });

  it('respects an explicit code', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('mkt'), code: 'MKTG' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('MKTG');
    createdTeamIds.push(res.body.id);
  });

  it('rejects a duplicate code', async () => {
    const a = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('a'), code: 'DUPE' });
    expect(a.status).toBe(201);
    createdTeamIds.push(a.body.id);

    const b = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('b'), code: 'DUPE' });
    expect(b.status).toBe(409);
  });

  it('401s without passcode', async () => {
    const res = await request(app).post('/api/teams').send({ name: 'no-auth' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/teams', () => {
  it('lists active teams', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/teams/:code', () => {
  it('returns the team by code', async () => {
    const created = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('lookup'), code: 'LKUP' });
    createdTeamIds.push(created.body.id);

    const res = await request(app).get('/api/teams/LKUP');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('LKUP');
  });

  it('returns 404 for an unknown code', async () => {
    const res = await request(app).get('/api/teams/NOPE');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/teams/:code/players (self-service)', () => {
  it('lets a player add themselves to a team without the passcode', async () => {
    const team = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('selfsvc'), code: 'SLFA' });
    createdTeamIds.push(team.body.id);

    const res = await request(app)
      .post('/api/teams/SLFA/players')
      .send({ name: '__test__newcomer' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: '__test__newcomer',
      teamId: team.body.id,
      isActive: true,
      score: 0,
    });
  });

  it('reactivates a deactivated player rather than creating a duplicate', async () => {
    const team = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('react'), code: 'RACT' });
    createdTeamIds.push(team.body.id);

    const created = await request(app)
      .post('/api/teams/RACT/players')
      .send({ name: '__test__returner' });
    await request(app)
      .patch(`/api/players/${created.body.id}`)
      .set(passHeader)
      .send({ isActive: false });

    const second = await request(app)
      .post('/api/teams/RACT/players')
      .send({ name: '__test__returner' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(created.body.id);
    expect(second.body.isActive).toBe(true);
  });

  it('409s if a name already exists and is active', async () => {
    const team = await request(app)
      .post('/api/teams')
      .set(passHeader)
      .send({ name: teamName('dup'), code: 'DUPN' });
    createdTeamIds.push(team.body.id);

    await request(app)
      .post('/api/teams/DUPN/players')
      .send({ name: '__test__taken' });
    const second = await request(app)
      .post('/api/teams/DUPN/players')
      .send({ name: '__test__taken' });
    expect(second.status).toBe(409);
  });
});
