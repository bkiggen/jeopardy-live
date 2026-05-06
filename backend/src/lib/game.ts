import { prisma } from '../prisma.js';
import { requireActiveSeason } from './season.js';
import type { GameRound, RoomScore } from './rooms.js';

export async function loadActiveScores(): Promise<RoomScore[]> {
  const season = await requireActiveSeason().catch(() => null);
  if (!season) return [];
  const players = await prisma.player.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    include: { scores: { where: { seasonId: season.id } } },
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
  delta: number,
): Promise<void> {
  const season = await requireActiveSeason();
  await prisma.seasonScore.upsert({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
    update: { totalScore: { increment: delta } },
    create: { playerId, seasonId: season.id, totalScore: delta },
  });
}
