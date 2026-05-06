// Server-side defense in depth — even when prompted not to, the model occasionally
// names the correct answer in incorrect-reasoning text. Scrub it before returning.
export function redactAnswer(reasoning: string, correctAnswer: string): string {
  if (!reasoning || !correctAnswer) return reasoning;

  const variants = new Set<string>();
  const cleaned = correctAnswer.replace(/\s+/g, ' ').trim();
  if (cleaned) variants.add(cleaned);

  const parenStripped = cleaned.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  if (parenStripped) variants.add(parenStripped);

  const outsideParens = cleaned
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (outsideParens) variants.add(outsideParens);

  const insideParens = cleaned.match(/\(([^)]*)\)/)?.[1]?.trim();
  if (insideParens) variants.add(insideParens);

  let result = reasoning;
  // Replace longest variants first so we don't double-replace overlapping fragments.
  const sorted = [...variants].sort((a, b) => b.length - a.length);
  for (const v of sorted) {
    if (v.length < 2) continue;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, '[redacted]');
  }
  return result;
}
