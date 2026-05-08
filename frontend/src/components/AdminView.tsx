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
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(true);

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [seasonName, setSeasonName] = useState(nextQuarterName());
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [editingPlayerName, setEditingPlayerName] = useState('');
  const [editingSeasonId, setEditingSeasonId] = useState<number | null>(null);
  const [editingSeasonName, setEditingSeasonName] = useState('');

  const [openSeasonId, setOpenSeasonId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [editingScorePlayerId, setEditingScorePlayerId] = useState<number | null>(null);
  const [editingScoreValue, setEditingScoreValue] = useState('');

  const refreshTeams = useCallback(async () => {
    try {
      const t = await api.getTeams();
      setTeams(t);
      if (selectedTeamId === null && t.length > 0) {
        setSelectedTeamId(t[0].id);
      }
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedTeamId]);

  const refreshTeamPlayers = useCallback(async () => {
    if (selectedTeamId === null) {
      setAllPlayers([]);
      setLoadingPlayers(false);
      return;
    }
    setLoadingPlayers(true);
    try {
      const list = await api.getPlayers(selectedTeamId, { all: true });
      setAllPlayers(list);
    } finally {
      setLoadingPlayers(false);
    }
  }, [selectedTeamId]);

  const refreshSeasons = useCallback(async () => {
    try {
      setSeasons(await api.getSeasons());
    } finally {
      setLoadingSeasons(false);
    }
  }, []);

  useEffect(() => {
    void refreshTeams();
    void refreshSeasons();
  }, [refreshTeams, refreshSeasons]);

  useEffect(() => {
    void refreshTeamPlayers();
  }, [refreshTeamPlayers]);

  // Refresh the open leaderboard when the selected team changes — otherwise
  // the previously fetched team's scores stick around and look like a bug.
  useEffect(() => {
    if (openSeasonId === null || selectedTeamId === null) return;
    let cancelled = false;
    void api.getLeaderboard(openSeasonId, selectedTeamId).then((board) => {
      if (!cancelled) setLeaderboard(board);
    });
    return () => {
      cancelled = true;
    };
  }, [openSeasonId, selectedTeamId]);

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

  function startEditingTeam(team: Team) {
    setEditingTeamId(team.id);
    setEditingTeamName(team.name);
  }

  function cancelEditingTeam() {
    setEditingTeamId(null);
    setEditingTeamName('');
  }

  async function saveTeamName(team: Team) {
    const trimmed = editingTeamName.trim();
    if (!trimmed || trimmed === team.name) {
      cancelEditingTeam();
      return;
    }
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.updateTeam(team.id, { name: trimmed }),
      );
      if (result == null) return;
      await refreshTeams();
      cancelEditingTeam();
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

  function startEditingPlayer(p: Player) {
    setEditingPlayerId(p.id);
    setEditingPlayerName(p.name);
  }
  function cancelEditingPlayer() {
    setEditingPlayerId(null);
    setEditingPlayerName('');
  }
  async function savePlayerName(p: Player) {
    const trimmed = editingPlayerName.trim();
    if (!trimmed || trimmed === p.name) {
      cancelEditingPlayer();
      return;
    }
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.updatePlayer(p.id, { name: trimmed }),
      );
      if (result == null) return;
      await Promise.all([refreshTeamPlayers(), refreshPlayers()]);
      cancelEditingPlayer();
    } finally {
      setBusy(false);
    }
  }
  async function deletePlayer(p: Player) {
    if (!confirm(`Delete "${p.name}"? This wipes their season scores.`)) return;
    setBusy(true);
    try {
      const result = await callProtected(() => api.deletePlayer(p.id));
      if (result === null) return;
      await Promise.all([refreshTeamPlayers(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam(team: Team) {
    if (
      !confirm(
        `Delete team "${team.name}"? This wipes all players and season scores for this team.`,
      )
    ) return;
    setBusy(true);
    try {
      const result = await callProtected(() => api.deleteTeam(team.id));
      if (result === null) return;
      // Pick another team if the deleted one was selected.
      if (selectedTeamId === team.id) setSelectedTeamId(null);
      await refreshTeams();
    } finally {
      setBusy(false);
    }
  }

  function startEditingSeason(s: Season) {
    setEditingSeasonId(s.id);
    setEditingSeasonName(s.name);
  }
  function cancelEditingSeason() {
    setEditingSeasonId(null);
    setEditingSeasonName('');
  }
  async function saveSeasonName(s: Season) {
    const trimmed = editingSeasonName.trim();
    if (!trimmed || trimmed === s.name) {
      cancelEditingSeason();
      return;
    }
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.updateSeason(s.id, { name: trimmed }),
      );
      if (result == null) return;
      await refreshSeasons();
      cancelEditingSeason();
    } finally {
      setBusy(false);
    }
  }
  async function setActiveSeason(s: Season) {
    if (s.isActive) return;
    if (
      !confirm(
        `Make "${s.name}" the active season? New scores will accrue to it; the current active season will be deactivated.`,
      )
    ) return;
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.updateSeason(s.id, { isActive: true }),
      );
      if (result == null) return;
      await Promise.all([refreshSeasons(), refreshPlayers()]);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSeasonAt(s: Season) {
    if (s.isActive) {
      alert('Cannot delete the active season — start a new one first.');
      return;
    }
    if (!confirm(`Delete season "${s.name}"? This wipes all scores from that season.`))
      return;
    setBusy(true);
    try {
      const result = await callProtected(() => api.deleteSeason(s.id));
      if (result === null) return;
      if (openSeasonId === s.id) setOpenSeasonId(null);
      await refreshSeasons();
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
    // Same clip every time so voices can be A/B compared.
    try {
      const audio = new Audio(`/audio/${voiceId}/correct-1.mp3`);
      void audio.play();
    } catch {
      // preview is best effort
    }
    if (voiceId === settings.voice) return;
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

  function startEditingScore(entry: LeaderboardEntry) {
    setEditingScorePlayerId(entry.playerId);
    setEditingScoreValue(String(entry.totalScore));
  }
  function cancelEditingScore() {
    setEditingScorePlayerId(null);
    setEditingScoreValue('');
  }
  async function saveScore(entry: LeaderboardEntry) {
    if (openSeasonId === null || selectedTeamId === null) return;
    const next = Number.parseInt(editingScoreValue, 10);
    if (!Number.isFinite(next)) {
      cancelEditingScore();
      return;
    }
    if (next === entry.totalScore) {
      cancelEditingScore();
      return;
    }
    setBusy(true);
    try {
      const result = await callProtected(() =>
        api.setScore(entry.playerId, selectedTeamId, openSeasonId, next),
      );
      if (result == null) return;
      const board = await api.getLeaderboard(openSeasonId, selectedTeamId);
      setLeaderboard(board);
      cancelEditingScore();
    } finally {
      setBusy(false);
    }
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
                    disabled={busy}
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

        {loadingTeams ? (
          <ul className="flex flex-col gap-2" aria-label="Loading teams">
            {[0, 1].map((i) => (
              <li key={i} className="h-12 bg-white/5 rounded animate-pulse" />
            ))}
          </ul>
        ) : teams.length === 0 ? (
          <p className="text-jeopardy-cream/60 text-sm">No teams yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((t) => {
              const selected = t.id === selectedTeamId;
              const editing = t.id === editingTeamId;
              return (
                <li
                  key={t.id}
                  className={`flex items-center justify-between gap-2 rounded px-3 py-2 ${
                    selected ? 'bg-jeopardy-gold/10 border border-jeopardy-gold/40' : 'bg-white/5'
                  } ${t.isActive ? '' : 'opacity-60'}`}
                >
                  {editing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveTeamName(t);
                      }}
                      className="flex-1 flex items-center gap-2 min-w-0"
                    >
                      <input
                        type="text"
                        value={editingTeamName}
                        onChange={(e) => setEditingTeamName(e.target.value)}
                        autoFocus
                        maxLength={50}
                        className="min-w-0 flex-1 px-2 py-1 rounded bg-white/10 text-jeopardy-cream border border-jeopardy-gold/30"
                      />
                      <span className="text-jeopardy-gold/70 text-xs font-mono uppercase tracking-widest shrink-0">
                        {t.code}
                      </span>
                      <button
                        type="submit"
                        disabled={busy}
                        className="shrink-0 px-3 py-1 bg-jeopardy-gold text-jeopardy-navy-deep rounded text-sm font-bold disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingTeam}
                        className="shrink-0 px-3 py-1 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
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
                        onClick={() => startEditingTeam(t)}
                        disabled={busy}
                        className="shrink-0 px-2 py-1 text-jeopardy-cream/60 hover:text-jeopardy-cream text-sm"
                        title="Rename team"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTeam(t)}
                        disabled={busy}
                        className={`shrink-0 px-3 py-1 rounded text-sm disabled:opacity-50 ${
                          t.isActive
                            ? 'bg-red-600/40 hover:bg-red-600/70 text-white'
                            : 'bg-green-600/40 hover:bg-green-600/70 text-white'
                        }`}
                      >
                        {t.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTeam(t)}
                        disabled={busy}
                        className="shrink-0 px-2 py-1 text-red-300/70 hover:text-red-300 text-sm disabled:opacity-50"
                        title="Delete team"
                      >
                        ✕
                      </button>
                    </>
                  )}
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

            {loadingPlayers ? (
              <ul className="flex flex-col gap-2" aria-label="Loading players">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="h-10 bg-white/5 rounded animate-pulse" />
                ))}
              </ul>
            ) : allPlayers.length === 0 ? (
              <p className="text-jeopardy-cream/60 text-sm">No players on this team yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {allPlayers.map((p) => {
                  const editing = p.id === editingPlayerId;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-2 rounded px-3 py-2 ${
                        p.isActive ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'
                      }`}
                    >
                      {editing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void savePlayerName(p);
                          }}
                          className="flex-1 flex items-center gap-2 min-w-0"
                        >
                          <input
                            type="text"
                            value={editingPlayerName}
                            onChange={(e) => setEditingPlayerName(e.target.value)}
                            autoFocus
                            maxLength={100}
                            className="min-w-0 flex-1 px-2 py-1 rounded bg-white/10 text-jeopardy-cream border border-jeopardy-gold/30"
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className="shrink-0 px-3 py-1 bg-jeopardy-gold text-jeopardy-navy-deep rounded text-sm font-bold disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingPlayer}
                            className="shrink-0 px-3 py-1 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="text-jeopardy-cream font-medium flex-1 min-w-0 truncate">
                            {p.name}
                            {!p.isActive && (
                              <span className="ml-2 text-xs uppercase tracking-wide text-jeopardy-cream/40">
                                inactive
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditingPlayer(p)}
                            disabled={busy}
                            className="shrink-0 px-2 py-1 text-jeopardy-cream/60 hover:text-jeopardy-cream text-sm"
                            title="Rename player"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePlayer(p)}
                            disabled={busy}
                            className={`shrink-0 px-3 py-1 rounded text-sm disabled:opacity-50 ${
                              p.isActive
                                ? 'bg-red-600/40 hover:bg-red-600/70 text-white'
                                : 'bg-green-600/40 hover:bg-green-600/70 text-white'
                            }`}
                          >
                            {p.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePlayer(p)}
                            disabled={busy}
                            className="shrink-0 px-2 py-1 text-red-300/70 hover:text-red-300 text-sm disabled:opacity-50"
                            title="Delete player"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
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

        {loadingSeasons ? (
          <ul className="flex flex-col gap-2" aria-label="Loading seasons">
            {[0, 1].map((i) => (
              <li key={i} className="h-11 bg-white/5 rounded animate-pulse" />
            ))}
          </ul>
        ) : seasons.length === 0 ? (
          <p className="text-jeopardy-cream/60 text-sm">No seasons.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {seasons.map((s) => {
              const editing = s.id === editingSeasonId;
              return (
              <li key={s.id} className="bg-white/5 rounded">
                {editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveSeasonName(s);
                    }}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <input
                      type="text"
                      value={editingSeasonName}
                      onChange={(e) => setEditingSeasonName(e.target.value)}
                      autoFocus
                      maxLength={20}
                      className="min-w-0 flex-1 px-2 py-1 rounded bg-white/10 text-jeopardy-cream border border-jeopardy-gold/30"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="shrink-0 px-3 py-1 bg-jeopardy-gold text-jeopardy-navy-deep rounded text-sm font-bold disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditingSeason}
                      className="shrink-0 px-3 py-1 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                <div className="flex items-center gap-1 hover:bg-white/10 rounded">
                  <button
                    type="button"
                    onClick={() => viewSeason(s.id)}
                    className="flex-1 flex items-center justify-between px-3 py-2 text-left min-w-0"
                  >
                    <span className="text-jeopardy-cream font-medium truncate">
                      {s.name}
                      {s.isActive && (
                        <span className="ml-2 text-xs uppercase tracking-wide text-jeopardy-gold">
                          active
                        </span>
                      )}
                    </span>
                    <span className="text-jeopardy-cream/50 text-sm shrink-0">
                      {openSeasonId === s.id ? '▼' : '▸'}
                    </span>
                  </button>
                  {!s.isActive && (
                    <button
                      type="button"
                      onClick={() => setActiveSeason(s)}
                      disabled={busy}
                      className="shrink-0 px-2 py-1 text-xs uppercase tracking-widest bg-jeopardy-gold/20 text-jeopardy-gold hover:bg-jeopardy-gold/40 rounded disabled:opacity-50"
                      title="Make this the active season"
                    >
                      Set active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEditingSeason(s)}
                    disabled={busy}
                    className="shrink-0 px-2 py-2 text-jeopardy-cream/60 hover:text-jeopardy-cream text-sm"
                    title="Rename season"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSeasonAt(s)}
                    disabled={busy || s.isActive}
                    className="shrink-0 px-2 py-2 text-red-300/70 hover:text-red-300 text-sm disabled:opacity-30"
                    title={s.isActive ? 'Active season — cannot delete' : 'Delete season'}
                  >
                    ✕
                  </button>
                </div>
                )}
                {openSeasonId === s.id && (
                  <div className="px-3 pb-3 border-t border-jeopardy-gold/10">
                    <p className="text-jeopardy-cream/40 text-xs uppercase tracking-widest pt-2">
                      {teams.find((t) => t.id === selectedTeamId)?.name ?? '—'} leaderboard
                    </p>
                    {leaderboard.length === 0 ? (
                      <p className="text-jeopardy-cream/40 text-sm py-2">
                        No players on this team.
                      </p>
                    ) : (
                      <ol className="flex flex-col gap-1 mt-2">
                        {leaderboard.map((e, i) => {
                          const editing = e.playerId === editingScorePlayerId;
                          return (
                            <li
                              key={e.playerId}
                              className="flex items-center justify-between gap-2 text-sm py-1"
                            >
                              <span className="text-jeopardy-cream flex-1 min-w-0 truncate">
                                {i + 1}. {e.name}
                              </span>
                              {editing ? (
                                <form
                                  onSubmit={(ev) => {
                                    ev.preventDefault();
                                    void saveScore(e);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="number"
                                    step={1}
                                    value={editingScoreValue}
                                    onChange={(ev) => setEditingScoreValue(ev.target.value)}
                                    autoFocus
                                    className="w-28 px-2 py-1 rounded bg-white/10 text-jeopardy-cream font-mono border border-jeopardy-gold/30 text-right"
                                  />
                                  <button
                                    type="submit"
                                    disabled={busy}
                                    className="shrink-0 px-3 py-1 bg-jeopardy-gold text-jeopardy-navy-deep rounded text-xs font-bold disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingScore}
                                    className="shrink-0 px-3 py-1 bg-white/10 text-jeopardy-cream rounded text-xs hover:bg-white/20"
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <>
                                  <span
                                    className={`font-mono ${
                                      e.totalScore < 0
                                        ? 'text-red-400'
                                        : 'text-jeopardy-gold'
                                    }`}
                                  >
                                    ${e.totalScore.toLocaleString()}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => startEditingScore(e)}
                                    disabled={busy}
                                    className="shrink-0 px-2 py-1 text-jeopardy-cream/60 hover:text-jeopardy-cream text-sm disabled:opacity-50"
                                    title="Edit score"
                                  >
                                    ✎
                                  </button>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
