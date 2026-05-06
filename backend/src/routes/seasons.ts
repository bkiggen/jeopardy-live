import { Router } from 'express';

const router = Router();

// GET /api/seasons
router.get('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

// GET /api/seasons/:id/scores
router.get('/:id/scores', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

// POST /api/seasons — start new season
router.post('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
