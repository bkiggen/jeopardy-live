import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('POST /api/judge', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('400s when fields are missing', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-fake';
    const res = await request(app)
      .post('/api/judge')
      .send({ question: 'q', correctAnswer: 'a' });
    expect(res.status).toBe(400);
  });

  it('400s on completely empty body', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-fake';
    const res = await request(app).post('/api/judge').send({});
    expect(res.status).toBe(400);
  });

  it('503s when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app).post('/api/judge').send({
      question: 'Who painted the Mona Lisa?',
      correctAnswer: 'Leonardo da Vinci',
      playerAnswer: 'da Vinci',
    });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: expect.stringContaining('ANTHROPIC_API_KEY'),
    });
  });

  it('503s when ANTHROPIC_API_KEY is empty string', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const res = await request(app).post('/api/judge').send({
      question: 'Q',
      correctAnswer: 'A',
      playerAnswer: 'B',
    });
    expect(res.status).toBe(503);
  });
});
