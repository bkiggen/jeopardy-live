import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const SYSTEM_PROMPT = `You are judging Jeopardy! answers. Compare the player's spoken answer to the correct response.

Be lenient on:
- Minor spelling and pronunciation variations ("Cleopatra" vs "Cleopatra the seventh")
- Articles ("the X" vs "X")
- Honorifics and titles ("President Lincoln" vs "Lincoln")
- Word order in lists
- Partial names when unambiguous ("Einstein" for "Albert Einstein")

Be strict on:
- Wrong facts, wrong people, wrong places
- Missing key qualifiers that change meaning
- Answers that are merely related but not the specific response

You MUST respond with ONLY a JSON object, no preamble, no markdown fences. Schema:
{"correct": boolean, "reasoning": string}

Keep "reasoning" under 30 words.`;

type JudgeBody = {
  question?: string;
  correctAnswer?: string;
  playerAnswer?: string;
};

type JudgeResult = { correct: boolean; reasoning: string };

router.post('/', async (req, res) => {
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

  res.json(parsed);
});

export default router;
