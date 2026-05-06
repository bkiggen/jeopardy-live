import { Router } from 'express';

const router = Router();

// GET /api/players — active players + current season scores
router.get('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

// POST /api/players — add player
router.post('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

// PATCH /api/players/:id — deactivate / reactivate
router.patch('/:id', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
