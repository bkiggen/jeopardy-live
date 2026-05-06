import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { usePasscode } from '../context/PasscodeContext';

export function Landing() {
  const navigate = useNavigate();
  const { callProtected } = usePasscode();
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startGame() {
    setBusy(true);
    setError(null);
    try {
      const result = await callProtected(() => api.createRoom(), {
        message: 'Enter the host passcode to start a game.',
      });
      if (result == null) return;
      navigate(`/r/${result.code}?host=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function joinGame(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError('Codes are 4 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.getRoom(code);
      navigate(`/r/${code}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('404') ? 'Room not found.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-12">
      <h1 className="font-display text-jeopardy-gold text-6xl sm:text-7xl tracking-widest text-shadow-tile text-center">
        STANDUP JEOPARDY
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        <section className="bg-jeopardy-navy rounded-lg border-2 border-jeopardy-gold/30 p-6 flex flex-col gap-4">
          <h2 className="font-display text-jeopardy-gold text-3xl tracking-wider">
            HOST
          </h2>
          <p className="text-jeopardy-cream/70 text-sm">
            Start a new game. Share the code so others can join.
          </p>
          <button
            type="button"
            onClick={startGame}
            disabled={busy}
            className="px-6 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream disabled:opacity-50 transition-colors"
          >
            Start Game
          </button>
        </section>

        <section className="bg-jeopardy-navy rounded-lg border-2 border-jeopardy-gold/30 p-6 flex flex-col gap-4">
          <h2 className="font-display text-jeopardy-gold text-3xl tracking-wider">
            JOIN
          </h2>
          <p className="text-jeopardy-cream/70 text-sm">
            Got a 4-letter code? Drop it in to join the game.
          </p>
          <form onSubmit={joinGame} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="ABCD"
              className="flex-1 px-3 py-3 rounded bg-white/10 text-jeopardy-cream font-display text-2xl tracking-[0.5em] uppercase placeholder-jeopardy-cream/30 border border-jeopardy-gold/30 text-center"
            />
            <button
              type="submit"
              disabled={busy || joinCode.length !== 4}
              className="px-6 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
            >
              Join
            </button>
          </form>
        </section>
      </div>

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
