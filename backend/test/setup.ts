import 'dotenv/config';
import { afterAll, beforeAll } from 'vitest';
import { prisma } from '../src/prisma.js';

const TEST_PREFIX = '__test__';
const TEST_PASSCODE = '__test_passcode__';
const TEST_TEAM_NAME = '__test__team';
const TEST_TEAM_CODE = '__TST';

export { TEST_PREFIX, TEST_PASSCODE, TEST_TEAM_CODE };
export const passHeader = { 'x-app-passcode': TEST_PASSCODE };

let testTeamId = 0;
export function getTestTeamId(): number {
  return testTeamId;
}

async function cleanupTestData() {
  const testTeams = await prisma.team.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const testTeamIds = testTeams.map((t) => t.id);

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { name: { startsWith: TEST_PREFIX } },
        { teamId: { in: testTeamIds } },
      ],
    },
    select: { id: true },
  });
  const playerIds = players.map((p) => p.id);
  if (playerIds.length) {
    await prisma.seasonScore.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
  }
  if (testTeamIds.length) {
    await prisma.team.deleteMany({ where: { id: { in: testTeamIds } } });
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
  const team = await prisma.team.create({
    data: { name: TEST_TEAM_NAME, code: TEST_TEAM_CODE, isActive: true },
  });
  testTeamId = team.id;
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});
