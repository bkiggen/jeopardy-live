// CORS_ORIGIN env var: comma-separated allowlist, or empty to allow any origin (dev-only).
export function corsOrigin(): string[] | true {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
