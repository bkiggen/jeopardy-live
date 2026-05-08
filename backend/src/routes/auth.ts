import { Router } from 'express';
import { requirePasscode } from '../lib/passcode.js';

const router = Router();

// POST /api/auth/verify — side-effect-free passcode check. The frontend hits
// this before sending someone into a host page so the passcode prompt fires
// up front instead of as a confusing socket-join failure.
router.post('/verify', requirePasscode, (_req, res) => {
  res.json({ ok: true });
});

export default router;
