import { Router } from 'express';
import { rooms } from '../lib/rooms.js';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

// POST /api/rooms — host creates a room. Returns the room code.
router.post('/', requirePasscode, async (_req, res) => {
  const room = rooms.create();
  res.status(201).json({ code: room.code, createdAt: room.createdAt });
});

// GET /api/rooms/:code — anyone can check whether a room exists (used by the join flow).
router.get('/:code', async (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) {
    res.status(404).json({ error: 'room not found' });
    return;
  }
  res.json({
    code: room.code,
    memberCount: room.members.size,
    hostConnected: room.hostSocketId !== null,
  });
});

export default router;
