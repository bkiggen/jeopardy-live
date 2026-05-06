import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type LeaderboardEntry,
  type Player,
  type Season,
} from '../api';

type Props = {
  refreshPlayers: () => Promise<void>;
};

function currentQuarterName(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function nextQuarterName(d = new Date()): string {
  const next = new Date(d.getFullYear(), d.getMonth() + 3, 1);
  return currentQuarterName(next);
}

export function AdminView({ refreshPlayers }: Props) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [seasonName, setSeasonName] = useState(nextQuarterName());

  const [openSeasonId, setOpenSeasonId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const refreshAll = useCallback(async () => {
    const [players, ss] = await Promise.all([
      api.getPlayers({ all: true }),
      api.getSeasons(),
    ]);
    setAllPlayers(players);
    setSeasons(ss);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.addPlayer(name.trim());
      setName('');
      await Promise.all([refreshAll(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Player) {
    setBusy(true);
    try {
      await api.togglePlayer(p.id, !p.isActive);
      await Promise.all([refreshAll(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function startSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!seasonName.trim()) return;
    if (!confirm(`Start "${seasonName}"? This deactivates the current season.`)) return;
    setBusy(true);
    try {
      await api.startSeason(seasonName.trim());
      setSeasonName(nextQuarterName());
      await Promise.all([refreshAll(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function viewSeason(id: number) {
    if (openSeasonId === id) {
      setOpenSeasonId(null);
      return;
    }
    const board = await api.getLeaderboard(id);
    setOpenSeasonId(id);
    setLeaderboard(board);
  }

  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-8">
      {/* Players */}
      <section>
        <h2 className="text-jeopardy-gold text-xl font-bold mb-3">PLAYERS</h2>
        <form onSubmit={add} className="flex gap-2 mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {allPlayers.length === 0 ? (
          <p className="text-jeopardy-cream/60 text-sm">No players yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {allPlayers.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded px-3 py-2 ${
                  p.isActive ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'
                }`}
              >
                <span className="text-jeopardy-cream font-medium">
                  {p.name}
                  {!p.isActive && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-jeopardy-cream/40">
                      inactive
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  disabled={busy}
                  className={`px-3 py-1 rounded text-sm disabled:opacity-50 ${
                    p.isActive
                      ? 'bg-red-600/40 hover:bg-red-600/70 text-white'
                      : 'bg-green-600/40 hover:bg-green-600/70 text-white'
                  }`}
                >
                  {p.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Seasons */}
      <section>
        <h2 className="text-jeopardy-gold text-xl font-bold mb-3">SEASONS</h2>
        <form onSubmit={startSeason} className="flex gap-2 mb-4">
          <input
            type="text"
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            maxLength={20}
            className="flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream border border-jeopardy-gold/30"
          />
          <button
            type="submit"
            disabled={busy || !seasonName.trim()}
            className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
          >
            Start New Season
          </button>
        </form>

        {seasons.length === 0 ? (
          <p className="text-jeopardy-cream/60 text-sm">No seasons.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {seasons.map((s) => (
              <li key={s.id} className="bg-white/5 rounded">
                <button
                  type="button"
                  onClick={() => viewSeason(s.id)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded"
                >
                  <span className="text-jeopardy-cream font-medium">
                    {s.name}
                    {s.isActive && (
                      <span className="ml-2 text-xs uppercase tracking-wide text-jeopardy-gold">
                        active
                      </span>
                    )}
                  </span>
                  <span className="text-jeopardy-cream/50 text-sm">
                    {openSeasonId === s.id ? '▼' : '▸'}
                  </span>
                </button>
                {openSeasonId === s.id && (
                  <div className="px-3 pb-3 border-t border-jeopardy-gold/10">
                    {leaderboard.length === 0 ? (
                      <p className="text-jeopardy-cream/40 text-sm py-2">
                        No scores recorded.
                      </p>
                    ) : (
                      <ol className="flex flex-col gap-1 mt-2">
                        {leaderboard.map((e, i) => (
                          <li
                            key={e.playerId}
                            className="flex justify-between text-sm py-1"
                          >
                            <span className="text-jeopardy-cream">
                              {i + 1}. {e.name}
                            </span>
                            <span
                              className={`font-mono ${
                                e.totalScore < 0
                                  ? 'text-red-400'
                                  : 'text-jeopardy-gold'
                              }`}
                            >
                              ${e.totalScore.toLocaleString()}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
