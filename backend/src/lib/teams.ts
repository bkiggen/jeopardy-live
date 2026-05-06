import { prisma } from '../prisma.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const CODE_LENGTH = 4;

export function generateTeamCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export async function reserveUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateTeamCode();
    const existing = await prisma.team.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error('could not generate a unique team code');
}

export async function findTeamByCode(code: string) {
  return prisma.team.findUnique({ where: { code: code.toUpperCase() } });
}
