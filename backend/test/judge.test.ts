import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { redactAnswer } from '../src/lib/judge.js';
import { passHeader } from './setup.js';

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
      .set(passHeader)
      .send({ question: 'q', correctAnswer: 'a' });
    expect(res.status).toBe(400);
  });

  it('400s on completely empty body', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-fake';
    const res = await request(app).post('/api/judge').set(passHeader).send({});
    expect(res.status).toBe(400);
  });

  it('503s when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app).post('/api/judge').set(passHeader).send({
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
    const res = await request(app).post('/api/judge').set(passHeader).send({
      question: 'Q',
      correctAnswer: 'A',
      playerAnswer: 'B',
    });
    expect(res.status).toBe(503);
  });

  it('401s without passcode header', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-fake';
    const res = await request(app)
      .post('/api/judge')
      .send({ question: 'Q', correctAnswer: 'A', playerAnswer: 'B' });
    expect(res.status).toBe(401);
  });
});

describe('redactAnswer', () => {
  it('scrubs the full correct answer (case-insensitive)', () => {
    const out = redactAnswer(
      'Lady Macbeth is wrong; Cleopatra is the answer.',
      'Cleopatra',
    );
    expect(out.toLowerCase()).not.toContain('cleopatra');
  });

  it('scrubs both the paren-stripped and outside-paren forms', () => {
    const reasoning =
      'Player said only the surname. Freddy Boom-Boom Washington was correct, but Washington alone is too vague.';
    const out = redactAnswer(reasoning, '(Freddy Boom-Boom) Washington');
    expect(out).not.toMatch(/Freddy Boom-Boom Washington/i);
    expect(out).not.toMatch(/\bWashington\b/i);
  });

  it('keeps reasoning intact when answer is not present', () => {
    const out = redactAnswer('Wrong era.', 'Galileo Galilei');
    expect(out).toBe('Wrong era.');
  });

  it('uses word boundaries (does not over-redact substrings)', () => {
    // correctAnswer "Mars" should NOT scrub the word "marshmallow"
    const out = redactAnswer('Player named a marshmallow brand.', 'Mars');
    expect(out).toContain('marshmallow');
  });

  it('handles empty inputs', () => {
    expect(redactAnswer('', 'Cleopatra')).toBe('');
    expect(redactAnswer('any text', '')).toBe('any text');
  });
});
