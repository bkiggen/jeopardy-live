import type { Request, Response, NextFunction } from 'express';

const HEADER = 'x-app-passcode';

export function requirePasscode(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    res.status(503).json({
      error: 'APP_PASSCODE not configured',
      hint: 'Set APP_PASSCODE in backend/.env to enable host-only endpoints',
    });
    return;
  }

  const provided = req.header(HEADER);
  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'invalid passcode' });
    return;
  }

  next();
}

export const PASSCODE_HEADER = HEADER;
