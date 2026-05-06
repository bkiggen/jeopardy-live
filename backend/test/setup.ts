import 'dotenv/config';
import { afterAll, beforeAll } from 'vitest';
import { prisma } from '../src/prisma.js';

const TEST_PREFIX = '__test__';
const TEST_PASSCODE = '__test_passcode__';

export { TEST_PREFIX, TEST_PASSCODE };
export const passHeader = { 'x-app-passcode': TEST_PASSCODE };

async function cleanupTestData() {
  const players = await prisma.player.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = players.map((p) => p.id);
  if (ids.length) {
    await prisma.seasonScore.deleteMany({ where: { playerId: { in: ids } } });
    await prisma.player.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.season.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
}

beforeAll(async () => {
  process.env.APP_PASSCODE = TEST_PASSCODE;
  const active = await prisma.season.findFirst({ where: { isActive: true } });
  if (!active) {
    throw new Error(
      'no active season — run `npx prisma db seed` before testing',
    );
  }
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});
