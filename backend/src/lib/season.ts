import { prisma } from '../prisma.js';

export function currentQuarterName(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

export async function getActiveSeason() {
  return prisma.season.findFirst({ where: { isActive: true } });
}

export async function requireActiveSeason() {
  const season = await getActiveSeason();
  if (!season) {
    throw new Error('no active season — POST /api/seasons or run `npx prisma db seed`');
  }
  return season;
}

export async function ensureScore(playerId: number, seasonId: number) {
  return prisma.seasonScore.upsert({
    where: { playerId_seasonId: { playerId, seasonId } },
    update: {},
    create: { playerId, seasonId, totalScore: 0 },
  });
}
