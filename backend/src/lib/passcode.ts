import type { Request, Response, NextFunction } from 'express';

const HEADER = 'x-app-passcode';

export function isValidPasscode(value: string | undefined | null): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return false;
  return Boolean(value) && value === expected;
}

export function passcodeConfigured(): boolean {
  return Boolean(process.env.APP_PASSCODE);
}

export function requirePasscode(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!passcodeConfigured()) {
    res.status(503).json({
      error: 'APP_PASSCODE not configured',
      hint: 'Set APP_PASSCODE in backend/.env to enable host-only endpoints',
    });
    return;
  }
  if (!isValidPasscode(req.header(HEADER))) {
    res.status(401).json({ error: 'invalid passcode' });
    return;
  }
  next();
}

export const PASSCODE_HEADER = HEADER;
