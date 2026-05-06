import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ensureScore, requireActiveSeason } from '../lib/season.js';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

// GET /api/players?teamId=N (or ?teamCode=ABCD) — active players + their score
// for the active season scoped to the given team. Pass ?all=true to include
// deactivated players (used by the admin view).
router.get('/', async (req, res) => {
  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  const teamId = await resolveTeamId(req.query);
  if (teamId == null) {
    res.status(400).json({ error: 'teamId or teamCode is required' });
    return;
  }

  const includeInactive = req.query.all === 'true';
  const players = await prisma.player.findMany({
    where: {
      teamId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { id: 'asc' },
    include: {
      scores: { where: { seasonId: season.id, teamId } },
    },
  });

  res.json(
    players.map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      teamId: p.teamId,
      score: p.scores[0]?.totalScore ?? 0,
    })),
  );
});

// POST /api/players — add a player to a specific team and bootstrap their score row.
router.post('/', requirePasscode, async (req, res) => {
  const { name, teamId } = req.body as { name?: string; teamId?: number };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (typeof teamId !== 'number') {
    res.status(400).json({ error: 'teamId is required' });
    return;
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    res.status(404).json({ error: 'team not found' });
    return;
  }

  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  const player = await prisma.player.create({
    data: { name: name.trim(), isActive: true, teamId },
  });
  await ensureScore(player.id, season.id, teamId);

  res.status(201).json({
    id: player.id,
    name: player.name,
    isActive: true,
    teamId,
    score: 0,
  });
});

// PATCH /api/players/:id — rename and/or toggle isActive
router.patch('/:id', requirePasscode, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid player id' });
    return;
  }

  const { isActive, name } = req.body as { isActive?: boolean; name?: string };
  const data: { isActive?: boolean; name?: string } = {};
  if (typeof isActive === 'boolean') data.isActive = isActive;
  if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 100);
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'nothing to update' });
    return;
  }

  const player = await prisma.player.update({ where: { id }, data });
  res.json(player);
});

// DELETE /api/players/:id — wipes the player and their season scores.
router.delete('/:id', requirePasscode, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid player id' });
    return;
  }
  await prisma.$transaction([
    prisma.seasonScore.deleteMany({ where: { playerId: id } }),
    prisma.player.delete({ where: { id } }),
  ]);
  res.status(204).end();
});

async function resolveTeamId(query: Record<string, unknown>): Promise<number | null> {
  if (typeof query.teamId === 'string') {
    const id = Number.parseInt(query.teamId, 10);
    if (Number.isFinite(id)) return id;
  }
  if (typeof query.teamCode === 'string') {
    const team = await prisma.team.findUnique({
      where: { code: query.teamCode.toUpperCase() },
      select: { id: true },
    });
    return team?.id ?? null;
  }
  return null;
}

export default router;
