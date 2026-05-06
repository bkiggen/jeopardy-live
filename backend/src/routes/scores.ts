import { Router } from 'express';
import { requireActiveSeason } from '../lib/season.js';
import { requirePasscode } from '../lib/passcode.js';
import { adjustPlayerScore } from '../lib/game.js';
import { prisma } from '../prisma.js';

const router = Router();

// POST /api/scores/adjust — { playerId, teamId, delta } -> updated score
router.post('/adjust', requirePasscode, async (req, res) => {
  const { playerId, teamId, delta } = req.body as {
    playerId?: number;
    teamId?: number;
    delta?: number;
  };
  if (
    typeof playerId !== 'number' ||
    typeof teamId !== 'number' ||
    typeof delta !== 'number'
  ) {
    res.status(400).json({
      error: 'playerId, teamId, and delta (numbers) are required',
    });
    return;
  }

  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  await adjustPlayerScore(playerId, teamId, delta);
  const score = await prisma.seasonScore.findUnique({
    where: {
      playerId_seasonId_teamId: { playerId, seasonId: season.id, teamId },
    },
    select: { totalScore: true },
  });

  res.json({
    playerId,
    seasonId: season.id,
    teamId,
    totalScore: score?.totalScore ?? 0,
  });
});

export default router;
