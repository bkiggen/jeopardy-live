const BASE = import.meta.env.VITE_API_URL ?? '';

export type Player = {
  id: number;
  name: string;
  isActive: boolean;
  score: number;
};

export type Clue = {
  id: number;
  value: number;
  question: string;
  answer: string;
};

export type RoundData = {
  category: string;
  showNumber: number;
  round: 'single' | 'double';
  clues: Clue[];
};

export type FinalClue = {
  id: number;
  category: string;
  question: string;
  answer: string;
};

export type GameClue = {
  id: number;
  value: number;
  question: string;
  answer: string;
};

export type GameRound = {
  category: string;
  showNumber: number;
  type: 'single' | 'double';
  clues: GameClue[];
};

export type PendingJudgement = {
  playerId: number;
  playerName: string;
  answer: string;
  state: 'judging' | 'correct' | 'incorrect';
  reasoning: string | null;
};

export type ActiveClue = {
  id: number;
  value: number;
  question: string;
  answer: string;
  revealed: boolean;
  buzzedPlayerId: number | null;
  typingAnswer: string;
  lockedOutPlayerIds: number[];
  pendingJudgement: PendingJudgement | null;
};

export type RoomScore = {
  playerId: number;
  name: string;
  score: number;
};

export type RoomGameState = {
  round: GameRound | null;
  usedClueIds: number[];
  activeClue: ActiveClue | null;
};

export type RoomLastAdjust = {
  playerId: number;
  playerName: string;
  delta: number;
};

export type Season = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

export type LeaderboardEntry = {
  playerId: number;
  name: string;
  totalScore: number;
};

const PASSCODE_KEY = 'standup-jeopardy:passcode';

export function getPasscode(): string | null {
  try {
    return localStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;
  }
}

export function setPasscode(value: string): void {
  try {
    localStorage.setItem(PASSCODE_KEY, value);
  } catch {
    // ignore
  }
}

export function clearPasscode(): void {
  try {
    localStorage.removeItem(PASSCODE_KEY);
  } catch {
    // ignore
  }
}

export class PasscodeRequiredError extends Error {
  constructor() {
    super('passcode required');
    this.name = 'PasscodeRequiredError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const passcode = getPasscode();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (passcode) headers['x-app-passcode'] = passcode;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearPasscode();
    throw new PasscodeRequiredError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getPlayers: (opts?: { all?: boolean }) =>
    request<Player[]>(`/api/players${opts?.all ? '?all=true' : ''}`),
  addPlayer: (name: string) =>
    request<Player>('/api/players', { method: 'POST', body: JSON.stringify({ name }) }),
  togglePlayer: (id: number, isActive: boolean) =>
    request<Player>(`/api/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),
  adjustScore: (playerId: number, delta: number) =>
    request<{ playerId: number; seasonId: number; totalScore: number }>(
      '/api/scores/adjust',
      { method: 'POST', body: JSON.stringify({ playerId, delta }) },
    ),
  getRandomCategory: (round: 'single' | 'double') =>
    request<RoundData>(`/api/clues/random-category?round=${round}`),
  getFinal: () => request<FinalClue>('/api/clues/final'),
  getSeasons: () => request<Season[]>('/api/seasons'),
  getLeaderboard: (id: number) =>
    request<LeaderboardEntry[]>(`/api/seasons/${id}/scores`),
  startSeason: (name?: string) =>
    request<Season>('/api/seasons', {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    }),
  judge: (input: { question: string; correctAnswer: string; playerAnswer: string }) =>
    request<{ correct: boolean; reasoning: string }>('/api/judge', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createRoom: () =>
    request<{ code: string; createdAt: number }>('/api/rooms', { method: 'POST' }),
  getRoom: (code: string) =>
    request<{ code: string; memberCount: number; hostConnected: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}`,
    ),
};

export type JudgeOutcome =
  | { kind: 'correct'; reasoning: string }
  | { kind: 'incorrect'; reasoning: string }
  | { kind: 'unavailable'; message: string };

export async function judgeAnswer(input: {
  question: string;
  correctAnswer: string;
  playerAnswer: string;
}): Promise<JudgeOutcome> {
  try {
    const result = await api.judge(input);
    return { kind: result.correct ? 'correct' : 'incorrect', reasoning: result.reasoning };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('503')) {
      return {
        kind: 'unavailable',
        message: 'Judge unavailable — set ANTHROPIC_API_KEY in backend/.env. Falling back to manual scoring.',
      };
    }
    return { kind: 'unavailable', message: `Judge failed: ${msg}` };
  }
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
