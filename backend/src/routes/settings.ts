import { Router } from 'express';
import { getSettings, updateSettings } from '../lib/settings.js';
import { requirePasscode } from '../lib/passcode.js';
import { publicVoices } from '../lib/voices.js';

const router = Router();

// GET /api/settings — open; the frontend reads this to know the active
// voice and feature toggles. Includes the list of selectable voices.
router.get('/', async (_req, res) => {
  res.json({ ...getSettings(), voices: publicVoices() });
});

// POST /api/settings — host-only.
router.post('/', requirePasscode, async (req, res) => {
  const next = await updateSettings(req.body ?? {});
  res.json({ ...next, voices: publicVoices() });
});

export default router;
