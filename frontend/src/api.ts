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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getPlayers: () => request<Player[]>('/api/players'),
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
};

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
