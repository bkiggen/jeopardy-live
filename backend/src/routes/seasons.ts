import { Router } from 'express';
import { prisma } from '../prisma.js';
import { currentQuarterName } from '../lib/season.js';

const router = Router();

// GET /api/seasons — all seasons, newest first
router.get('/', async (_req, res) => {
  const seasons = await prisma.season.findMany({
    orderBy: { startDate: 'desc' },
  });
  res.json(seasons);
});

// GET /api/seasons/:id/scores — leaderboard for a season
router.get('/:id/scores', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid season id' });
    return;
  }

  const scores = await prisma.seasonScore.findMany({
    where: { seasonId: id },
    include: { player: true },
    orderBy: { totalScore: 'desc' },
  });

  res.json(
    scores.map((s) => ({
      playerId: s.playerId,
      name: s.player.name,
      totalScore: s.totalScore,
    })),
  );
});

// POST /api/seasons — start a new active season (deactivates others)
router.post('/', async (req, res) => {
  const { name, startDate } = req.body as { name?: string; startDate?: string };
  const seasonName = name?.trim() || currentQuarterName();
  const start = startDate ? new Date(startDate) : new Date();

  const season = await prisma.$transaction(async (tx) => {
    await tx.season.updateMany({
      where: { isActive: true },
      data: { isActive: false, endDate: new Date() },
    });
    return tx.season.create({
      data: { name: seasonName, startDate: start, isActive: true },
    });
  });

  res.status(201).json(season);
});

export default router;
