import { Router } from 'express';
import { prisma } from '../prisma.js';
import { rooms } from '../lib/rooms.js';

const router = Router();

// GET /api/rooms/:code — checks if a team with this code exists; the
// in-memory live room spins up on demand when someone connects via socket.
router.get('/:code', async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { code: req.params.code.toUpperCase() },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!team || !team.isActive) {
    res.status(404).json({ error: 'team not found' });
    return;
  }

  const liveRoom = rooms.get(team.code);
  res.json({
    code: team.code,
    teamId: team.id,
    teamName: team.name,
    memberCount: liveRoom?.members.size ?? 0,
    hostConnected: liveRoom ? liveRoom.hostSocketId !== null : false,
  });
});

export default router;
