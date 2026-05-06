import { Router } from 'express';

const router = Router();

// GET /api/clues/random-category?round=single|double
router.get('/random-category', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

// GET /api/clues/final
router.get('/final', async (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
