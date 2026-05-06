import 'dotenv/config';
import { prisma } from '../prisma.js';
import { currentQuarterName } from '../lib/season.js';

async function main() {
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) {
    console.log(`active season already exists: ${existing.name} (id=${existing.id})`);
    return;
  }

  const name = currentQuarterName();
  const now = new Date();
  const startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  const season = await prisma.season.create({
    data: { name, startDate, isActive: true },
  });
  console.log(`seeded season: ${season.name} (id=${season.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
