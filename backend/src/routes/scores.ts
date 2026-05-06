import { Router } from 'express';

const router = Router();

// POST /api/scores/adjust — { playerId, delta }
router.post('/adjust', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
