import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type LeaderboardEntry,
  type Player,
  type Season,
  type Team,
} from '../api';
import { usePasscode } from '../context/PasscodeContext';
import { useSettings } from '../hooks/useSettings';

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
  const { callProtected } = usePasscode();
  const { settings, setSettings, refresh: refreshSettings } = useSettings();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [busy, setBusy] = useState(false);

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [seasonName, setSeasonName] = useState(nextQuarterName());

  const [openSeasonId, setOpenSeasonId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const refreshTeams = useCallback(async () => {
    const t = await api.getTeams();
    setTeams(t);
    if (selectedTeamId === null && t.length > 0) {
      setSelectedTeamId(t[0].id);
    }
  }, [selectedTeamId]);

  const refreshTeamPlayers = useCallback(async () => {
    if (selectedTeamId === null) {
      setAllPlayers([]);
      return;
    }
    const list = await api.getPlayers(selectedTeamId, { all: true });
    setAllPlayers(list);
  }, [selectedTeamId]);

  const refreshSeasons = useCallback(async () => {
    setSeasons(await api.getSeasons());
  }, []);

  useEffect(() => {
    void refreshTeams();
    void refreshSeasons();
  }, [refreshTeams, refreshSeasons]);

  useEffect(() => {
    void refreshTeamPlayers();
  }, [refreshTeamPlayers]);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.addTeam({
          name: newTeamName.trim(),
          code: newTeamCode.trim() || undefined,
        }),
      );
      if (result == null) return;
      setNewTeamName('');
      setNewTeamCode('');
      await refreshTeams();
      setSelectedTeamId(result.id);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTeam(team: Team) {
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.updateTeam(team.id, { isActive: !team.isActive }),
      );
      if (result == null) return;
      await refreshTeams();
    } finally {
      setBusy(false);
    }
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerName.trim() || selectedTeamId === null) return;
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.addPlayer(newPlayerName.trim(), selectedTeamId),
      );
      if (result == null) return;
      setNewPlayerName('');
      await Promise.all([refreshTeamPlayers(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function togglePlayer(p: Player) {
    setBusy(true);
    try {
      const result = await callProtected(() => api.togglePlayer(p.id, !p.isActive));
      if (result == null) return;
      await Promise.all([refreshTeamPlayers(), refreshPlayers()]);
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
      const result = await callProtected(() => api.startSeason(seasonName.trim()));
      if (result == null) return;
      setSeasonName(nextQuarterName());
      await Promise.all([refreshSeasons(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMoneyBurning() {
    const next = !settings.moneyBurningMode;
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.setSettings({ moneyBurningMode: next }),
      );
      if (result == null) return;
      setSettings(result);
    } finally {
      setBusy(false);
      void refreshSettings();
    }
  }

  async function selectVoice(voiceId: string) {
    setBusy(true);
    try {
      const result = await callProtected(() => api.setSettings({ voice: voiceId }));
      if (result == null) return;
      setSettings(result);
    } finally {
      setBusy(false);
      void refreshSettings();
    }
  }

  async function viewSeason(id: number) {
    if (openSeasonId === id) {
      setOpenSeasonId(null);
      return;
    }
    if (selectedTeamId === null) return;
    const board = await api.getLeaderboard(id, selectedTeamId);
    setOpenSeasonId(id);
    setLeaderboard(board);
  }

  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-8">
      {/* Settings */}
      <section>
        <h2 className="text-jeopardy-gold text-xl font-bold mb-3">SETTINGS</h2>
        <div className="flex flex-col gap-3">
          <div className="bg-white/5 rounded p-4 flex flex-col gap-2">
            <span className="text-jeopardy-cream font-medium">Host voice</span>
            <div className="flex flex-wrap gap-2">
              {settings.voices.map((v) => {
                const active = v.id === settings.voice;
                return (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => selectVoice(v.id)}
                    disabled={busy || active}
                    className={`px-4 py-2 rounded font-bold text-sm transition-colors disabled:opacity-70 ${
                      active
                        ? 'bg-jeopardy-gold text-jeopardy-navy-deep'
                        : 'bg-white/10 hover:bg-white/20 text-jeopardy-cream'
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white/5 rounded p-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-jeopardy-cream font-medium">
                Money-burning mode {settings.moneyBurningMode ? '🔥' : ''}
              </span>
              <span className="text-jeopardy-cream/60 text-xs">
                When ON, the host's voice reads each clue aloud via ElevenLabs
                live. When OFF, only the committed sound clips play.
              </span>
            </div>
            <button
              type="button"
              onClick={toggleMoneyBurning}
              disabled={busy}
              className={`shrink-0 px-5 py-2 rounded font-bold text-sm uppercase tracking-widest transition-colors disabled:opacity-50 ${
                settings.moneyBurningMode
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-jeopardy-cream'
              }`}
            >
              {settings.moneyBurningMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </section>

      {/* Teams */}
      <section>
        <h2 className="text-jeopardy-gold text-xl font-bold mb-3">TEAMS</h2>
        <form onSubmit={createTeam} className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name (e.g. Engineering)"
            className="flex-1 min-w-0 px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
          />
          <input
            type="text"
            value={newTeamCode}
            onChange={(e) => setNewTeamCode(e.target.value.toUpperCase())}
            placeholder="Code (auto)"
            maxLength={8}
            className="w-32 px-3 py-2 rounded bg-white/10 text-jeopardy-cream font-display tracking-widest placeholder-jeopardy-cream/30 border border-jeopardy-gold/30 uppercase"
          />
          <button
            type="submit"
            disabled={busy || !newTeamName.trim()}
            className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
          >
            Create Team
          </button>
        </form>

        {teams.length === 0 ? (
          <p className="text-jeopardy-cream/60 text-sm">No teams yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((t) => {
              const selected = t.id === selectedTeamId;
              return (
                <li
                  key={t.id}
                  className={`flex items-center justify-between rounded px-3 py-2 ${
                    selected ? 'bg-jeopardy-gold/10 border border-jeopardy-gold/40' : 'bg-white/5'
                  } ${t.isActive ? '' : 'opacity-60'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTeamId(t.id)}
                    className="flex-1 text-left flex items-center gap-3 min-w-0"
                  >
                    <span className="text-jeopardy-cream font-medium truncate">
                      {t.name}
                    </span>
                    <span className="text-jeopardy-gold/70 text-xs font-mono uppercase tracking-widest">
                      {t.code}
                    </span>
                    {!t.isActive && (
                      <span className="text-jeopardy-cream/40 text-xs uppercase tracking-wide">
                        inactive
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTeam(t)}
                    disabled={busy}
                    className={`shrink-0 ml-2 px-3 py-1 rounded text-sm disabled:opacity-50 ${
                      t.isActive
                        ? 'bg-red-600/40 hover:bg-red-600/70 text-white'
                        : 'bg-green-600/40 hover:bg-green-600/70 text-white'
                    }`}
                  >
                    {t.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Players */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-jeopardy-gold text-xl font-bold">PLAYERS</h2>
          {selectedTeamId !== null && (
            <span className="text-jeopardy-cream/50 text-xs uppercase tracking-widest">
              for {teams.find((t) => t.id === selectedTeamId)?.name}
            </span>
          )}
        </div>
        {selectedTeamId === null ? (
          <p className="text-jeopardy-cream/60 text-sm">Select a team to manage its players.</p>
        ) : (
          <>
            <form onSubmit={addPlayer} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Player name"
                className="flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
              />
              <button
                type="submit"
                disabled={busy || !newPlayerName.trim()}
                className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
              >
                Add
              </button>
            </form>

            {allPlayers.length === 0 ? (
              <p className="text-jeopardy-cream/60 text-sm">No players on this team yet.</p>
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
                      onClick={() => togglePlayer(p)}
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
          </>
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
                    <p className="text-jeopardy-cream/40 text-xs uppercase tracking-widest pt-2">
                      {teams.find((t) => t.id === selectedTeamId)?.name ?? '—'} leaderboard
                    </p>
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
