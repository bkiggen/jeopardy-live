import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();

// GET /api/clues/random-category?round=single|double
// Picks a real episode's category that has exactly 5 clues for the requested round.
router.get('/random-category', async (req, res) => {
  const round = String(req.query.round ?? 'single');
  if (round !== 'single' && round !== 'double') {
    res.status(400).json({ error: 'round must be "single" or "double"' });
    return;
  }

  const picks = await prisma.$queryRaw<{ category: string; show_number: number }[]>`
    SELECT category, show_number
    FROM clues
    WHERE round = ${round}
      AND category IS NOT NULL
      AND show_number IS NOT NULL
      AND value IS NOT NULL
      AND question IS NOT NULL
      AND answer IS NOT NULL
    GROUP BY category, show_number
    HAVING COUNT(*) = 5
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (picks.length === 0) {
    res.status(404).json({ error: 'no category found' });
    return;
  }

  const { category, show_number } = picks[0];
  const clues = await prisma.clue.findMany({
    where: { category, showNumber: show_number, round },
    orderBy: { value: 'asc' },
  });

  res.json({
    category,
    showNumber: show_number,
    round,
    clues: clues.map((c) => ({
      id: c.id,
      value: c.value,
      question: c.question,
      answer: c.answer,
    })),
  });
});

// GET /api/clues/final — random Final Jeopardy clue
router.get('/final', async (_req, res) => {
  const picks = await prisma.$queryRaw<
    { id: number; category: string; question: string; answer: string }[]
  >`
    SELECT id, category, question, answer
    FROM clues
    WHERE round = 'final'
      AND category IS NOT NULL
      AND question IS NOT NULL
      AND answer IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (picks.length === 0) {
    res.status(404).json({ error: 'no final jeopardy clue found' });
    return;
  }

  res.json(picks[0]);
});

export default router;
