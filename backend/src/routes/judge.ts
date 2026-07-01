import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { redactAnswer } from '../lib/judge.js';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

const SYSTEM_PROMPT = `You are the host of Jeopardy! Your job is to judge whether a player's answer is correct, then deliver brief on-air feedback — exactly as a real Jeopardy host would.

JUDGING RULES — be lenient on:
- Minor spelling and pronunciation variations ("Cleopatra" vs "Cleopatra the seventh")
- Articles ("the X" vs "X")
- Honorifics and titles ("President Lincoln" vs "Lincoln")
- Word order in lists
- Partial names when unambiguous ("Einstein" for "Albert Einstein")

Be strict on:
- Wrong facts, wrong people, wrong places
- Missing key qualifiers that change meaning
- Answers that are merely related but not the specific response

CRITICAL — HOST RULE: You are on live television with other contestants still in the game. When a player gets it WRONG, you MUST NOT reveal the correct answer in any way — not the name, not a partial spelling, not an obvious synonym, not a "rhymes with" clue, nothing. Other players haven't answered yet and it would be completely unfair to tip them off.

When ruling INCORRECT:
- Give only vague, general feedback about why the guess missed: wrong era, wrong country, wrong field, wrong type of person, fictional vs. real, etc.
- Never say "the correct answer is…", "it should be…", "think of…", "it starts with…", or anything that narrows it down.
- Treat it exactly as a real host would on TV — sympathetic but tight-lipped.
- Good examples: "Ooh, not quite — wrong continent on that one." / "That's a fictional character; we needed a real historical figure." / "Right field, wrong century."
- Bad examples: "Lady Macbeth is incorrect; it's Cleopatra." / "Close — think Egyptian queen." / "The answer started with a C."

When ruling CORRECT, you may naturally reference the answer in your reasoning.

You MUST respond with ONLY a JSON object, no preamble, no markdown fences. Schema:
{"correct": boolean, "reasoning": string}

Keep "reasoning" under 30 words.`;

type JudgeBody = {
  question?: string;
  correctAnswer?: string;
  playerAnswer?: string;
};

type JudgeResult = { correct: boolean; reasoning: string };

router.post('/', requirePasscode, async (req, res) => {
  const { question, correctAnswer, playerAnswer } = req.body as JudgeBody;
  if (!question || !correctAnswer || !playerAnswer) {
    res.status(400).json({
      error: 'question, correctAnswer, and playerAnswer are all required',
    });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured',
      hint: 'Add ANTHROPIC_API_KEY to backend/.env to enable Claude-based judging',
    });
    return;
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Question: ${question}\nCorrect answer: ${correctAnswer}\nPlayer's answer: ${playerAnswer}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: JudgeResult;
  try {
    parsed = JSON.parse(stripped) as JudgeResult;
    if (typeof parsed.correct !== 'boolean' || typeof parsed.reasoning !== 'string') {
      throw new Error('shape mismatch');
    }
  } catch {
    res.status(502).json({
      error: 'judge returned malformed JSON',
      raw: text,
    });
    return;
  }

  if (!parsed.correct) {
    parsed.reasoning = redactAnswer(parsed.reasoning, correctAnswer);
  }

  res.json(parsed);
});

export default router;
