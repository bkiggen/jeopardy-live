import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma.js';
import { requireActiveSeason } from './season.js';
import { redactAnswer } from './judge.js';
import type { GameRound, RoomScore } from './rooms.js';

export async function loadActiveScores(teamId: number): Promise<RoomScore[]> {
  const season = await requireActiveSeason().catch(() => null);
  if (!season) return [];
  const players = await prisma.player.findMany({
    where: { isActive: true, teamId },
    orderBy: { id: 'asc' },
    include: {
      scores: { where: { seasonId: season.id, teamId } },
    },
  });
  return players.map((p) => ({
    playerId: p.id,
    name: p.name,
    score: p.scores[0]?.totalScore ?? 0,
  }));
}

export async function pickRandomCategory(
  type: 'single' | 'double',
): Promise<GameRound | null> {
  const picks = await prisma.$queryRaw<
    { category: string; show_number: number }[]
  >`
    SELECT category, show_number
    FROM clues
    WHERE round = ${type}
      AND category IS NOT NULL
      AND show_number IS NOT NULL
      AND value IS NOT NULL
      AND question IS NOT NULL
      AND answer IS NOT NULL
    GROUP BY category, show_number
    HAVING COUNT(*) = 5
    ORDER BY RANDOM()
    LIMIT 1
  `;
  if (picks.length === 0) return null;
  const { category, show_number: showNumber } = picks[0];
  const clues = await prisma.clue.findMany({
    where: { category, showNumber, round: type },
    orderBy: { value: 'asc' },
  });
  return {
    category,
    showNumber,
    type,
    clues: clues.map((c) => ({
      id: c.id,
      value: c.value ?? 0,
      question: c.question ?? '',
      answer: c.answer ?? '',
    })),
  };
}

export async function adjustPlayerScore(
  playerId: number,
  teamId: number,
  delta: number,
): Promise<void> {
  const season = await requireActiveSeason();
  await prisma.seasonScore.upsert({
    where: {
      playerId_seasonId_teamId: {
        playerId,
        seasonId: season.id,
        teamId,
      },
    },
    update: { totalScore: { increment: delta } },
    create: { playerId, seasonId: season.id, teamId, totalScore: delta },
  });
}

const JUDGE_SYSTEM_PROMPT = `You are judging Jeopardy! answers. Compare the player's typed answer to the correct response.

Players are typing in a hurry. Default to ACCEPTING. Mark CORRECT when the player has clearly identified the right answer, even sloppily.

Accept liberally:
- Misspellings, even multi-letter ones, as long as the answer is recognizable ("Faulknor" → Faulkner ✓, "Cleopatera" → Cleopatra ✓, "Schwarzaneger" → Schwarzenegger ✓)
- Phonetic spellings, dropped/added letters, swapped vowels
- Articles, honorifics, titles dropped or added ("the Mona Lisa" or "Mona Lisa", "President Lincoln" or just "Lincoln")
- Word order in lists
- Partial names when unambiguous ("Einstein", "Cleopatra", "da Vinci")
- Casing, punctuation, extra trailing words

Mark INCORRECT only when:
- The answer is a different person/place/thing entirely
- The answer is unrecognizable as the correct response (not just a typo — actually a different word)
- The factual claim is wrong

When in doubt, give the benefit of the doubt and accept.

CRITICAL — When you rule INCORRECT:
- NEVER state, name, hint at, or spell the correct answer.
- Do NOT say "the correct answer is X", "it should be X", "they meant X", "this refers to X".
- Explain only why the player's specific answer is wrong: wrong category, wrong era, wrong field, wrong person type, etc.
- Good: "That's a fictional character, not a historical figure." / "Wrong continent." / "Right field, wrong person."
- Bad: "Lady Macbeth is wrong; Cleopatra is the answer."

When you rule CORRECT, you may reference the answer in reasoning.

You MUST respond with ONLY a JSON object, no preamble, no markdown fences. Schema:
{"correct": boolean, "reasoning": string}

Keep "reasoning" under 30 words.`;

export type JudgeOutcome =
  | { ok: true; correct: boolean; reasoning: string }
  | { ok: false; error: string };

export async function judgeAnswerServerSide(
  question: string,
  correctAnswer: string,
  playerAnswer: string,
): Promise<JudgeOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Question: ${question}\nCorrect answer: ${correctAnswer}\nPlayer's answer: ${playerAnswer}`,
        },
      ],
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: { correct: boolean; reasoning: string };
  try {
    parsed = JSON.parse(stripped) as { correct: boolean; reasoning: string };
    if (typeof parsed.correct !== 'boolean' || typeof parsed.reasoning !== 'string') {
      throw new Error('shape mismatch');
    }
  } catch {
    return { ok: false, error: 'judge returned malformed JSON' };
  }

  if (!parsed.correct) {
    parsed.reasoning = redactAnswer(parsed.reasoning, correctAnswer);
  }

  return { ok: true, correct: parsed.correct, reasoning: parsed.reasoning };
}
