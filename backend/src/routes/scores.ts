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

// POST /api/scores/set — { playerId, teamId, seasonId, totalScore } -> upserts an
// absolute season score for any season (not just the active one). Used by admin
// to manually correct totals.
router.post('/set', requirePasscode, async (req, res) => {
  const { playerId, teamId, seasonId, totalScore } = req.body as {
    playerId?: number;
    teamId?: number;
    seasonId?: number;
    totalScore?: number;
  };
  if (
    typeof playerId !== 'number' ||
    typeof teamId !== 'number' ||
    typeof seasonId !== 'number' ||
    typeof totalScore !== 'number' ||
    !Number.isInteger(totalScore)
  ) {
    res.status(400).json({
      error: 'playerId, teamId, seasonId, and integer totalScore are required',
    });
    return;
  }

  const [player, team, season] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerId }, select: { teamId: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }),
    prisma.season.findUnique({ where: { id: seasonId }, select: { id: true } }),
  ]);
  if (!player || !team || !season) {
    res.status(404).json({ error: 'player, team, or season not found' });
    return;
  }
  if (player.teamId !== teamId) {
    res.status(400).json({ error: 'player does not belong to that team' });
    return;
  }

  await prisma.seasonScore.upsert({
    where: {
      playerId_seasonId_teamId: { playerId, seasonId, teamId },
    },
    update: { totalScore },
    create: { playerId, seasonId, teamId, totalScore },
  });

  res.json({ playerId, seasonId, teamId, totalScore });
});

export default router;
