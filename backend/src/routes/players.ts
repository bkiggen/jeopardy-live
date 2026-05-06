import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ensureScore, requireActiveSeason } from '../lib/season.js';

const router = Router();

// GET /api/players — active players + their score for the active season.
// Pass ?all=true to include deactivated players (used by the admin view).
router.get('/', async (req, res) => {
  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  const includeInactive = req.query.all === 'true';
  const players = await prisma.player.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { id: 'asc' },
    include: {
      scores: { where: { seasonId: season.id } },
    },
  });

  res.json(
    players.map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      score: p.scores[0]?.totalScore ?? 0,
    })),
  );
});

// POST /api/players — add a player and bootstrap their season score row
router.post('/', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  const player = await prisma.player.create({
    data: { name: name.trim(), isActive: true },
  });
  await ensureScore(player.id, season.id);

  res.status(201).json({ id: player.id, name: player.name, isActive: true, score: 0 });
});

// PATCH /api/players/:id — toggle isActive
router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid player id' });
    return;
  }

  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive (boolean) is required' });
    return;
  }

  const player = await prisma.player.update({
    where: { id },
    data: { isActive },
  });
  res.json(player);
});

export default router;
