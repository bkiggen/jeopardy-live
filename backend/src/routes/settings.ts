import { Router } from 'express';
import { getSettings, updateSettings } from '../lib/settings.js';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

// GET /api/settings — open; the frontend reads this to decide whether
// to call paid endpoints like /api/host/speak.
router.get('/', async (_req, res) => {
  res.json(getSettings());
});

// POST /api/settings — host-only.
router.post('/', requirePasscode, async (req, res) => {
  const next = updateSettings(req.body ?? {});
  res.json(next);
});

export default router;
