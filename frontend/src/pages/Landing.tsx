import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { api, type Team } from '../api';
import { usePasscode } from '../context/PasscodeContext';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

export function Landing() {
  const navigate = useNavigate();
  const { callProtected } = usePasscode();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTeams = useCallback(async () => {
    try {
      setTeams(await api.getTeams());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  useEffect(() => {
    void refreshTeams();
    const onFocus = () => void refreshTeams();
    window.addEventListener('focus', onFocus);

    // Live host status — server emits lobby:host_changed whenever a team's
    // host slot is claimed or released, so the Host button stays accurate
    // without polling.
    const s: Socket = io(SOCKET_URL || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    s.on('lobby:host_changed', (payload: { code: string; hasHost: boolean }) => {
      setTeams((prev) =>
        prev.map((t) => (t.code === payload.code ? { ...t, hasHost: payload.hasHost } : t)),
      );
    });

    return () => {
      window.removeEventListener('focus', onFocus);
      s.disconnect();
    };
  }, [refreshTeams]);

  async function host(team: Team) {
    setBusy(true);
    setError(null);
    try {
      // Touch a passcode-gated endpoint to confirm the user has it before
      // sending them into the room (otherwise socket join would fail mid-load).
      const result = await callProtected(() => api.verifyPasscode(), {
        message: `Enter the host passcode to host "${team.name}".`,
      });
      if (result == null) return;
      navigate(`/r/${team.code}?host=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function joinAsPlayer(team: Team) {
    navigate(`/r/${team.code}`);
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await api.getTeam(code);
      navigate(`/r/${code}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('404') ? 'Game not found.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 gap-12">
      <h1 className="font-display text-jeopardy-gold text-6xl sm:text-7xl tracking-widest text-shadow-tile text-center">
        STANDUP JEOPARDY
      </h1>

      <section className="w-full max-w-3xl bg-jeopardy-navy rounded-lg border-2 border-jeopardy-gold/30 p-6 flex flex-col gap-4">
        <h2 className="font-display text-jeopardy-gold text-3xl tracking-wider">
          GAMES
        </h2>
        {loadingTeams ? (
          <ul className="flex flex-col gap-2" aria-label="Loading games">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 bg-white/5 rounded p-3 animate-pulse"
              >
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <div className="h-5 bg-white/10 rounded w-1/3" />
                  <div className="h-3 bg-white/10 rounded w-20" />
                </div>
                <div className="flex gap-2 shrink-0">
                  <div className="h-8 w-14 bg-white/10 rounded" />
                  <div className="h-8 w-14 bg-jeopardy-gold/20 rounded" />
                </div>
              </li>
            ))}
          </ul>
        ) : teams.length === 0 ? (
          <p className="text-jeopardy-cream/70 text-sm">
            No games yet. Go to <Link to="/admin" className="underline">Admin</Link> to create one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((team) => (
              <li
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 bg-white/5 rounded p-3"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-jeopardy-cream font-bold text-lg truncate">
                    {team.name}
                  </span>
                  <span className="text-jeopardy-cream/50 text-xs uppercase tracking-widest">
                    code · {team.code}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => joinAsPlayer(team)}
                    disabled={busy}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-jeopardy-cream rounded text-sm font-bold disabled:opacity-50"
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    onClick={() => host(team)}
                    disabled={busy || team.hasHost}
                    title={team.hasHost ? 'Someone is already hosting this game' : undefined}
                    className="px-4 py-1.5 bg-jeopardy-gold hover:bg-jeopardy-cream text-jeopardy-navy-deep rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {team.hasHost ? 'Hosted' : 'Host'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="w-full max-w-3xl bg-jeopardy-navy rounded-lg border-2 border-jeopardy-gold/30 p-6 flex flex-col gap-4">
        <h2 className="font-display text-jeopardy-gold text-3xl tracking-wider">
          JOIN BY CODE
        </h2>
        <p className="text-jeopardy-cream/70 text-sm">
          Got a 4-letter code from someone? Drop it in.
        </p>
        <form onSubmit={joinByCode} className="flex gap-2 w-full">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABCD"
            className="min-w-0 flex-1 px-3 py-3 rounded bg-white/10 text-jeopardy-cream font-display text-2xl tracking-[0.5em] uppercase placeholder-jeopardy-cream/30 border border-jeopardy-gold/30 text-center"
          />
          <button
            type="submit"
            disabled={busy || joinCode.length < 2}
            className="shrink-0 px-6 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
          >
            Join
          </button>
        </form>
      </section>

      {error && (
        <p className="text-red-300 bg-red-600/20 border border-red-500/40 rounded px-4 py-2 text-sm">
          {error}
        </p>
      )}

      <Link
        to="/admin"
        className="text-jeopardy-cream/40 text-xs uppercase tracking-widest hover:text-jeopardy-cream/80"
      >
        Admin
      </Link>
    </div>
  );
}
