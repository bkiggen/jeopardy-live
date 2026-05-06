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
      AND question NOT LIKE '%<a href%'
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
  // Normalize to modern values regardless of episode era. Old episodes used
  // half values (100/200/300/400/500 single, 200/.../1000 double); the ladder
  // here is what every player expects.
  const ladder = type === 'single'
    ? [200, 400, 600, 800, 1000]
    : [400, 800, 1200, 1600, 2000];
  const airDate = clues.find((c) => c.airDate)?.airDate ?? null;
  return {
    category,
    showNumber,
    airDate: airDate ? airDate.toISOString().slice(0, 10) : null,
    type,
    clues: clues.map((c, i) => ({
      id: c.id,
      value: ladder[i] ?? c.value ?? 0,
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

There is a HUMAN HOST who can override your ruling with one click. Your job is to be the friendly first pass, NOT the strict gatekeeper. Default to ACCEPTING. False rejections are worse than false approvals — if you're unsure, accept and the host will override if needed.

The standard: would a reasonable person hearing this answer say "yeah, that's it"? If yes, mark CORRECT.

Accept liberally:
- Any misspelling that sounds the same when read aloud ("Spright" → Sprite ✓, "Faulknor" → Faulkner ✓, "Klee-oh-patra" → Cleopatra ✓, "Schwarzaneger" → Schwarzenegger ✓)
- Phonetic spellings, dropped/added letters, swapped vowels
- Single dropped or added consonants (extra "h", missing "k", swapped "c"/"k")
- Articles, honorifics, titles dropped or added ("the Mona Lisa" or "Mona Lisa", "President Lincoln" or just "Lincoln")
- Word order in lists
- Last name only when unambiguous ("Einstein" for Albert Einstein ✓, "da Vinci" for Leonardo da Vinci ✓)
- Single-word / mononym answers ("Cleopatra" ✓, "Cher" ✓, "Madonna" ✓)
- Casing, punctuation, extra trailing words ("uhh, Cleopatra I think")
- "What is X?" / "Who is X?" prefixes (Jeopardy phrasing)

Names — important rule:
- If the correct answer is a person with a first AND last name, the player MUST give at least the last name. First name alone is INCORRECT.
- correct: "Max Ernst" | player: "Max" → INCORRECT (first name only, ambiguous)
- correct: "Max Ernst" | player: "Ernst" → CORRECT (last name)
- correct: "Max Ernst" | player: "Max Ernst" → CORRECT (full name)
- correct: "Albert Einstein" | player: "Albert" → INCORRECT
- correct: "Albert Einstein" | player: "Einstein" → CORRECT
- This rule does not apply to mononyms ("Cher", "Madonna", "Cleopatra") — those single-word answers are fine as given.

Phonetic test: try sounding the answer out. If it sounds substantially like the correct answer, accept.

Mark INCORRECT only when:
- The answer is a different person/place/thing entirely (not just a misspelled version)
- The answer is genuinely unrecognizable — not a typo of the right answer but actually a different word
- The factual claim is wrong (player named the wrong person/place/thing)

Examples of INCORRECT:
- correct: Cleopatra | player: Lady Macbeth — different character entirely
- correct: Sprite | player: Coca-Cola — different soda
- correct: Faulkner | player: Hemingway — different author

Examples of CORRECT:
- correct: Sprite | player: spright — typo, sounds the same ✓
- correct: Cleopatra | player: cleo — partial name, unambiguous ✓
- correct: Mark Twain | player: twain — last name only ✓

When in doubt, ACCEPT. The host will override.

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
