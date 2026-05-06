import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireActiveSeason } from '../lib/season.js';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

// POST /api/scores/adjust — { playerId, delta } -> updated score
router.post('/adjust', requirePasscode, async (req, res) => {
  const { playerId, delta } = req.body as { playerId?: number; delta?: number };
  if (typeof playerId !== 'number' || typeof delta !== 'number') {
    res.status(400).json({ error: 'playerId and delta (numbers) are required' });
    return;
  }

  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  const updated = await prisma.seasonScore.upsert({
    where: { playerId_seasonId: { playerId, seasonId: season.id } },
    update: { totalScore: { increment: delta } },
    create: { playerId, seasonId: season.id, totalScore: delta },
  });

  res.json({ playerId, seasonId: season.id, totalScore: updated.totalScore });
});

export default router;
