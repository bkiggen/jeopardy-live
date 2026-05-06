import { useState } from 'react';
import { api } from '../api';
import { useRoom } from '../context/RoomContext';

export function PlayerIdentityPrompt() {
  const { code, isHost, status, scores, actions, socketId, members } = useRoom();
  const [skipped, setSkipped] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = socketId ? members.find((m) => m.socketId === socketId) : undefined;
  if (me?.playerId) return null;
  if (skipped) return null;

  if (status !== 'connected') {
    return (
      <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-40">
        <div className="bg-jeopardy-navy rounded-lg w-full max-w-md border-4 border-jeopardy-gold/60 p-6 text-center">
          <h2 className="font-display text-jeopardy-gold text-3xl tracking-widest mb-3 animate-pulse">
            CONNECTING…
          </h2>
          <p className="text-jeopardy-cream/70 text-sm">Joining the room.</p>
        </div>
      </div>
    );
  }

  const claimedIds = new Set(
    members.filter((m) => m.playerId !== null).map((m) => m.playerId as number),
  );

  async function addMyself(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const player = await api.selfJoinPlayer(code, trimmed);
      const ack = await actions.identifyPlayer(player.id);
      if (!ack.ok) {
        setError(ack.error ?? 'identify failed');
        return;
      }
      // success — modal will hide once `me.playerId` is set via room:state
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409')) {
        setError('That name is taken on this team.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-40">
      <div className="bg-jeopardy-navy rounded-lg w-full max-w-md border-4 border-jeopardy-gold/60 p-6 flex flex-col gap-4">
        <h2 className="font-display text-jeopardy-gold text-3xl tracking-widest text-shadow-tile">
          WHO ARE YOU?
        </h2>
        <p className="text-jeopardy-cream/70 text-sm">
          {isHost
            ? 'Pick yourself if you want to play, or skip to just host.'
            : 'Tap your name. Scores attach to your player ID.'}
        </p>

        {scores.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {scores.map((s) => {
              const claimed = claimedIds.has(s.playerId);
              return (
                <button
                  type="button"
                  key={s.playerId}
                  disabled={claimed}
                  onClick={() => actions.identifyPlayer(s.playerId)}
                  className={`px-3 py-3 rounded font-bold text-lg transition-colors ${
                    claimed
                      ? 'bg-white/5 text-jeopardy-cream/30 cursor-not-allowed'
                      : 'bg-jeopardy-gold text-jeopardy-navy-deep hover:bg-jeopardy-cream'
                  }`}
                >
                  {s.name}
                  {claimed && (
                    <span className="block text-[10px] uppercase tracking-wider mt-1">
                      in use
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-sm text-jeopardy-cream/70 hover:text-jeopardy-cream underline self-start"
          >
            + I'm new — add me as a player
          </button>
        ) : (
          <form onSubmit={addMyself} className="flex flex-col gap-2 border-t border-jeopardy-gold/20 pt-3">
            <p className="text-jeopardy-cream/70 text-xs uppercase tracking-widest">
              Add yourself
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your name"
                className="min-w-0 flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
                autoFocus
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="shrink-0 px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
              >
                Join
              </button>
            </div>
            {error && (
              <p className="text-red-300 text-xs">{error}</p>
            )}
          </form>
        )}

        {isHost && (
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="text-jeopardy-cream/50 hover:text-jeopardy-cream text-xs uppercase tracking-widest"
          >
            Skip — just hosting today
          </button>
        )}
      </div>
    </div>
  );
}
