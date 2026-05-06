import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { TEST_PREFIX } from './setup.js';

const name = (suffix: string) => `${TEST_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function newPlayer(suffix: string) {
  const res = await request(app).post('/api/players').send({ name: name(suffix) });
  return res.body.id as number;
}

describe('POST /api/scores/adjust', () => {
  it('adds a positive delta', async () => {
    const id = await newPlayer('pos');
    const res = await request(app).post('/api/scores/adjust').send({ playerId: id, delta: 800 });
    expect(res.status).toBe(200);
    expect(res.body.totalScore).toBe(800);
  });

  it('subtracts and allows negative balances', async () => {
    const id = await newPlayer('neg');
    const res = await request(app).post('/api/scores/adjust').send({ playerId: id, delta: -400 });
    expect(res.status).toBe(200);
    expect(res.body.totalScore).toBe(-400);
  });

  it('accumulates across calls', async () => {
    const id = await newPlayer('accum');
    await request(app).post('/api/scores/adjust').send({ playerId: id, delta: 200 });
    await request(app).post('/api/scores/adjust').send({ playerId: id, delta: 200 });
    const last = await request(app).post('/api/scores/adjust').send({ playerId: id, delta: -100 });
    expect(last.body.totalScore).toBe(300);
  });

  it('400s on missing fields', async () => {
    const id = await newPlayer('badreq');
    const res = await request(app).post('/api/scores/adjust').send({ playerId: id });
    expect(res.status).toBe(400);
  });

  it('400s when delta is not a number', async () => {
    const id = await newPlayer('strdelta');
    const res = await request(app)
      .post('/api/scores/adjust')
      .send({ playerId: id, delta: 'oops' });
    expect(res.status).toBe(400);
  });
});
