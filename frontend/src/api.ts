const BASE = import.meta.env.VITE_API_URL ?? '';

export type Team = {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
  hasHost?: boolean;
};

export type Player = {
  id: number;
  name: string;
  isActive: boolean;
  teamId: number;
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
  buzzedAt: number | null;
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getTeams: () => request<Team[]>('/api/teams'),
  getTeam: (code: string) => request<Team>(`/api/teams/${encodeURIComponent(code)}`),
  addTeam: (input: { name: string; code?: string }) =>
    request<Team>('/api/teams', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTeam: (id: number, patch: { name?: string; isActive?: boolean }) =>
    request<Team>(`/api/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTeam: (id: number) =>
    request<void>(`/api/teams/${id}`, { method: 'DELETE' }),
  selfJoinPlayer: (teamCode: string, name: string) =>
    request<Player>(`/api/teams/${encodeURIComponent(teamCode)}/players`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getPlayers: (teamId: number, opts?: { all?: boolean }) => {
    const qs = new URLSearchParams({ teamId: String(teamId) });
    if (opts?.all) qs.set('all', 'true');
    return request<Player[]>(`/api/players?${qs.toString()}`);
  },
  addPlayer: (name: string, teamId: number) =>
    request<Player>('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name, teamId }),
    }),
  togglePlayer: (id: number, isActive: boolean) =>
    request<Player>(`/api/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),
  updatePlayer: (id: number, patch: { name?: string; isActive?: boolean }) =>
    request<Player>(`/api/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deletePlayer: (id: number) =>
    request<void>(`/api/players/${id}`, { method: 'DELETE' }),
  adjustScore: (playerId: number, teamId: number, delta: number) =>
    request<{ playerId: number; seasonId: number; teamId: number; totalScore: number }>(
      '/api/scores/adjust',
      { method: 'POST', body: JSON.stringify({ playerId, teamId, delta }) },
    ),
  getRandomCategory: (round: 'single' | 'double') =>
    request<RoundData>(`/api/clues/random-category?round=${round}`),
  getFinal: () => request<FinalClue>('/api/clues/final'),
  getSeasons: () => request<Season[]>('/api/seasons'),
  getLeaderboard: (id: number, teamId: number) =>
    request<LeaderboardEntry[]>(`/api/seasons/${id}/scores?teamId=${teamId}`),
  startSeason: (name?: string) =>
    request<Season>('/api/seasons', {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    }),
  updateSeason: (id: number, patch: { name: string }) =>
    request<Season>(`/api/seasons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteSeason: (id: number) =>
    request<void>(`/api/seasons/${id}`, { method: 'DELETE' }),
  judge: (input: { question: string; correctAnswer: string; playerAnswer: string }) =>
    request<{ correct: boolean; reasoning: string }>('/api/judge', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getRoom: (code: string) =>
    request<{
      code: string;
      teamId: number;
      teamName: string;
      memberCount: number;
      hostConnected: boolean;
    }>(`/api/rooms/${encodeURIComponent(code)}`),
  getSettings: () => request<AppSettings>('/api/settings'),
  setSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(patch),
    }),
};

export type AppSettings = {
  moneyBurningMode: boolean;
  voice: string;
  voices: Array<{ id: string; label: string }>;
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
