import { Router } from 'express';
import { prisma } from '../prisma.js';
import { currentQuarterName } from '../lib/season.js';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

// GET /api/seasons — all seasons, newest first
router.get('/', async (_req, res) => {
  const seasons = await prisma.season.findMany({
    orderBy: { startDate: 'desc' },
  });
  res.json(seasons);
});

// GET /api/seasons/:id/scores?teamId=N (or ?teamCode=ABCD) — leaderboard for a season
router.get('/:id/scores', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid season id' });
    return;
  }

  const teamId = await resolveTeamId(req.query);
  if (teamId == null) {
    res.status(400).json({ error: 'teamId or teamCode is required' });
    return;
  }

  // Include every team player so the admin can set scores for players who
  // have no SeasonScore row yet — they show up at 0.
  const players = await prisma.player.findMany({
    where: { teamId },
    include: { scores: { where: { seasonId: id, teamId } } },
  });

  const entries = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    totalScore: p.scores[0]?.totalScore ?? 0,
  }));
  entries.sort(
    (a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name),
  );

  res.json(entries);
});

// POST /api/seasons — start a new active season (deactivates others)
router.post('/', requirePasscode, async (req, res) => {
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

// PATCH /api/seasons/:id — rename or set as the active season.
// Setting isActive: true deactivates all other seasons in the same transaction.
router.patch('/:id', requirePasscode, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid season id' });
    return;
  }
  const { name, isActive } = req.body as { name?: string; isActive?: boolean };
  const data: { name?: string } = {};
  if (typeof name === 'string' && name.trim()) {
    data.name = name.trim().slice(0, 20);
  }
  if (Object.keys(data).length === 0 && typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'nothing to update' });
    return;
  }

  if (isActive === true) {
    const season = await prisma.$transaction(async (tx) => {
      await tx.season.updateMany({
        where: { isActive: true, NOT: { id } },
        data: { isActive: false, endDate: new Date() },
      });
      return tx.season.update({
        where: { id },
        data: { ...data, isActive: true, endDate: null },
      });
    });
    res.json(season);
    return;
  }

  if (isActive === false) {
    const season = await prisma.season.update({
      where: { id },
      data: { ...data, isActive: false, endDate: new Date() },
    });
    res.json(season);
    return;
  }

  const season = await prisma.season.update({ where: { id }, data });
  res.json(season);
});

// DELETE /api/seasons/:id — wipes the season and its scores. Refuses to
// delete the active season (start a new one first to avoid breaking play).
router.delete('/:id', requirePasscode, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid season id' });
    return;
  }
  const season = await prisma.season.findUnique({ where: { id } });
  if (!season) {
    res.status(404).json({ error: 'season not found' });
    return;
  }
  if (season.isActive) {
    res
      .status(409)
      .json({ error: 'cannot delete the active season — start a new season first' });
    return;
  }
  await prisma.$transaction([
    prisma.seasonScore.deleteMany({ where: { seasonId: id } }),
    prisma.season.delete({ where: { id } }),
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
