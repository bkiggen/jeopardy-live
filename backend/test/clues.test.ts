import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('GET /api/clues/random-category', () => {
  it('returns 5 single-round clues sorted by value asc', async () => {
    const res = await request(app).get('/api/clues/random-category?round=single');
    expect(res.status).toBe(200);
    expect(res.body.round).toBe('single');
    expect(res.body.category).toBeTruthy();
    expect(res.body.clues).toHaveLength(5);
    for (let i = 1; i < res.body.clues.length; i += 1) {
      expect(res.body.clues[i].value).toBeGreaterThanOrEqual(res.body.clues[i - 1].value);
    }
    for (const c of res.body.clues) {
      expect(typeof c.question).toBe('string');
      expect(typeof c.answer).toBe('string');
      expect(typeof c.value).toBe('number');
    }
  });

  it('returns 5 double-round clues', async () => {
    const res = await request(app).get('/api/clues/random-category?round=double');
    expect(res.status).toBe(200);
    expect(res.body.round).toBe('double');
    expect(res.body.clues).toHaveLength(5);
  });

  it('400s on an unsupported round', async () => {
    const res = await request(app).get('/api/clues/random-category?round=tiebreaker');
    expect(res.status).toBe(400);
  });

  it('defaults to single round when none is provided', async () => {
    const res = await request(app).get('/api/clues/random-category');
    expect(res.status).toBe(200);
    expect(res.body.round).toBe('single');
  });
});

describe('GET /api/clues/final', () => {
  it('returns a Final Jeopardy clue', async () => {
    const res = await request(app).get('/api/clues/final');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      category: expect.any(String),
      question: expect.any(String),
      answer: expect.any(String),
    });
  });
});
