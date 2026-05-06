import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { TEST_PREFIX, passHeader } from './setup.js';

const name = (suffix: string) => `${TEST_PREFIX}${suffix}-${Date.now()}`;

describe('POST /api/players', () => {
  it('creates a player at score 0', async () => {
    const res = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('alice') });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isActive: true, score: 0 });
    expect(res.body.name).toMatch(/^__test__alice-/);
    expect(typeof res.body.id).toBe('number');
  });

  it('400s on missing name', async () => {
    const res = await request(app).post('/api/players').set(passHeader).send({});
    expect(res.status).toBe(400);
  });

  it('400s on whitespace-only name', async () => {
    const res = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('401s without passcode header', async () => {
    const res = await request(app).post('/api/players').send({ name: name('noauth') });
    expect(res.status).toBe(401);
  });

  it('401s with wrong passcode', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('x-app-passcode', 'wrong-value')
      .send({ name: name('badauth') });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/players', () => {
  it('lists active players with their current-season score', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('lister') });
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(200);
    const found = res.body.find((p: { id: number }) => p.id === created.body.id);
    expect(found).toMatchObject({ isActive: true, score: 0 });
  });

  it('does NOT require the passcode (read-only endpoint for join flow)', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/players?all=true', () => {
  it('includes deactivated players', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('hidden') });
    await request(app)
      .patch(`/api/players/${created.body.id}`)
      .set(passHeader)
      .send({ isActive: false });

    const activeOnly = await request(app).get('/api/players');
    expect(activeOnly.body.find((p: { id: number }) => p.id === created.body.id)).toBeUndefined();

    const all = await request(app).get('/api/players?all=true');
    const found = all.body.find((p: { id: number }) => p.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.isActive).toBe(false);
  });
});

describe('PATCH /api/players/:id', () => {
  it('deactivates a player so they fall out of GET /api/players', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('toggle') });
    const playerId = created.body.id;

    const patch = await request(app)
      .patch(`/api/players/${playerId}`)
      .set(passHeader)
      .send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.isActive).toBe(false);

    const list = await request(app).get('/api/players');
    expect(list.body.find((p: { id: number }) => p.id === playerId)).toBeUndefined();
  });

  it('reactivates a deactivated player back into the active list', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('revive') });
    const playerId = created.body.id;

    await request(app)
      .patch(`/api/players/${playerId}`)
      .set(passHeader)
      .send({ isActive: false });
    const reactivated = await request(app)
      .patch(`/api/players/${playerId}`)
      .set(passHeader)
      .send({ isActive: true });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.isActive).toBe(true);

    const list = await request(app).get('/api/players');
    expect(list.body.find((p: { id: number }) => p.id === playerId)).toBeDefined();
  });

  it('400s when isActive is missing', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('badpatch') });
    const res = await request(app)
      .patch(`/api/players/${created.body.id}`)
      .set(passHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  it('401s without passcode', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(passHeader)
      .send({ name: name('patchauth') });
    const res = await request(app)
      .patch(`/api/players/${created.body.id}`)
      .send({ isActive: false });
    expect(res.status).toBe(401);
  });
});
