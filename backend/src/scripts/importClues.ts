import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../prisma.js';

const DATA_PATH = resolve(process.cwd(), 'src/data/200k_questions.json');
const BATCH_SIZE = 5000;

type RawClue = {
  category: string | null;
  air_date: string | null;
  question: string | null;
  value: string | null;
  answer: string | null;
  round: string | null;
  show_number: string | null;
};

const ROUND_MAP: Record<string, string> = {
  'Jeopardy!': 'single',
  'Double Jeopardy!': 'double',
  'Final Jeopardy!': 'final',
  'Tiebreaker': 'tiebreaker',
};

function parseValue(raw: string | null): number | null {
  if (!raw || raw === 'None' || raw === 'no value') return null;
  const cleaned = raw.replace(/[$,]/g, '');
  const n = Number.parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

function stripQuotes(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/^'|'$/g, '');
}

async function main() {
  console.log(`reading ${DATA_PATH}`);
  const raw = await readFile(DATA_PATH, 'utf8');
  const records: RawClue[] = JSON.parse(raw);
  console.log(`parsed ${records.length} records`);

  const rows = records.map((r) => ({
    showNumber: r.show_number ? Number.parseInt(r.show_number, 10) : null,
    airDate: r.air_date ? new Date(r.air_date) : null,
    round: r.round ? ROUND_MAP[r.round] ?? r.round.toLowerCase() : null,
    category: r.category ?? null,
    value: parseValue(r.value),
    question: stripQuotes(r.question),
    answer: r.answer ?? null,
  }));

  console.log('clearing existing clues table');
  await prisma.clue.deleteMany({});

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await prisma.clue.createMany({ data: chunk });
    inserted += chunk.length;
    process.stdout.write(`\rinserted ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');

  const total = await prisma.clue.count();
  const byRound = await prisma.clue.groupBy({ by: ['round'], _count: true });
  console.log(`done. ${total} clues in db. by round:`, byRound);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
