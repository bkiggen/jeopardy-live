import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requirePasscode } from '../lib/passcode.js';
import { reserveUniqueCode } from '../lib/teams.js';
import { rooms } from '../lib/rooms.js';

const router = Router();

// GET /api/teams — open; landing page lists these so hosts can pick one.
// Includes hasHost: true when a host is actively connected to that team's
// live room, so the UI can grey out the Host button.
router.get('/', async (_req, res) => {
  const teams = await prisma.team.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, isActive: true },
  });
  res.json(
    teams.map((t) => ({
      ...t,
      hasHost: Boolean(rooms.get(t.code)?.hostSocketId),
    })),
  );
});

// GET /api/teams/:code — fetch a single team by its room code.
router.get('/:code', async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { code: req.params.code.toUpperCase() },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!team) {
    res.status(404).json({ error: 'team not found' });
    return;
  }
  res.json(team);
});

// POST /api/teams — host-only. Body: { name, code? }. Code auto-generated if absent.
router.post('/', requirePasscode, async (req, res) => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const cleanName = name.trim().slice(0, 50);
  let cleanCode = code?.trim().toUpperCase();
  if (cleanCode) {
    if (!/^[A-Z2-9]{2,8}$/.test(cleanCode)) {
      res.status(400).json({
        error: 'code must be 2–8 letters/digits (excluding I, O, 0, 1)',
      });
      return;
    }
    const existing = await prisma.team.findUnique({ where: { code: cleanCode } });
    if (existing) {
      res.status(409).json({ error: 'code already in use' });
      return;
    }
  } else {
    cleanCode = await reserveUniqueCode();
  }

  const team = await prisma.team.create({
    data: { name: cleanName, code: cleanCode, isActive: true },
    select: { id: true, name: true, code: true, isActive: true },
  });
  res.status(201).json(team);
});

// POST /api/teams/:code/players — open self-service. Lets a player joining a
// room add themselves to that team's roster if their name isn't already in it.
// The room code is the de-facto credential; no passcode required.
router.post('/:code/players', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const team = await prisma.team.findUnique({ where: { code } });
  if (!team || !team.isActive) {
    res.status(404).json({ error: 'team not found' });
    return;
  }

  const { name } = req.body as { name?: string };
  const cleaned = name?.trim().slice(0, 100);
  if (!cleaned) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const existing = await prisma.player.findFirst({
    where: { teamId: team.id, name: cleaned },
  });
  if (existing) {
    if (!existing.isActive) {
      const reactivated = await prisma.player.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      res.status(200).json({
        id: reactivated.id,
        name: reactivated.name,
        isActive: true,
        teamId: team.id,
        score: 0,
      });
      return;
    }
    res.status(409).json({
      error: 'a player with that name already exists on this team',
      playerId: existing.id,
    });
    return;
  }

  const { requireActiveSeason } = await import('../lib/season.js');
  const { ensureScore } = await import('../lib/season.js');
  const season = await requireActiveSeason().catch(() => null);
  if (!season) {
    res.status(409).json({ error: 'no active season' });
    return;
  }

  const player = await prisma.player.create({
    data: { name: cleaned, isActive: true, teamId: team.id },
  });
  await ensureScore(player.id, season.id, team.id);

  res.status(201).json({
    id: player.id,
    name: player.name,
    isActive: true,
    teamId: team.id,
    score: 0,
  });
});

// PATCH /api/teams/:id — host-only. Rename or activate/deactivate.
router.patch('/:id', requirePasscode, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid team id' });
    return;
  }
  const { name, isActive } = req.body as { name?: string; isActive?: boolean };
  const data: { name?: string; isActive?: boolean } = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 50);
  if (typeof isActive === 'boolean') data.isActive = isActive;
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'nothing to update' });
    return;
  }
  const team = await prisma.team.update({ where: { id }, data });
  res.json(team);
});

// DELETE /api/teams/:id — wipes the team, its players, and all season scores.
// Tears down any in-memory live room with the same code.
router.delete('/:id', requirePasscode, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid team id' });
    return;
  }
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    res.status(404).json({ error: 'team not found' });
    return;
  }
  await prisma.$transaction([
    prisma.seasonScore.deleteMany({ where: { teamId: id } }),
    prisma.player.deleteMany({ where: { teamId: id } }),
    prisma.team.delete({ where: { id } }),
  ]);
  rooms.delete(team.code);
  res.status(204).end();
});

export default router;
