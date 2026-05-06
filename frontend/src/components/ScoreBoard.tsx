import { useEffect, useRef, useState } from 'react';
import type { Player } from '../api';
import type { LastAdjust } from '../App';

type Flash = 'up' | 'down' | undefined;

type Props = {
  players: Player[];
  lastAdjust: LastAdjust | null;
  onUndo: () => Promise<void>;
};

export function ScoreBoard({ players, lastAdjust, onUndo }: Props) {
  const prev = useRef<Map<number, number>>(new Map());
  const [flash, setFlash] = useState<Map<number, Flash>>(new Map());
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const next = new Map<number, Flash>();
    for (const p of players) {
      const old = prev.current.get(p.id);
      if (old !== undefined && old !== p.score) {
        next.set(p.id, p.score > old ? 'up' : 'down');
      }
    }
    if (next.size > 0) {
      setFlash(next);
      const t = setTimeout(() => setFlash(new Map()), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [players]);

  useEffect(() => {
    const m = new Map<number, number>();
    for (const p of players) m.set(p.id, p.score);
    prev.current = m;
  }, [players]);

  async function handleUndo() {
    setUndoing(true);
    try {
      await onUndo();
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="rounded-lg bg-jeopardy-navy p-4 h-full flex flex-col gap-3">
      <h2 className="text-jeopardy-gold text-lg font-bold">SCORES</h2>

      {lastAdjust && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoing}
          className="text-sm px-3 py-2 bg-white/10 hover:bg-white/20 text-jeopardy-cream rounded flex items-center justify-between disabled:opacity-50"
        >
          <span>↶ Undo</span>
          <span className="text-jeopardy-cream/70">
            {lastAdjust.delta >= 0 ? '+' : '−'}$
            {Math.abs(lastAdjust.delta).toLocaleString()} {lastAdjust.delta >= 0 ? 'to' : 'from'}{' '}
            {lastAdjust.playerName}
          </span>
        </button>
      )}

      {players.length === 0 ? (
        <p className="text-jeopardy-cream/60 text-sm">
          No active players. Add some in the Admin tab.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((p) => {
            const f = flash.get(p.id);
            const flashClass =
              f === 'up'
                ? 'bg-green-500/40'
                : f === 'down'
                  ? 'bg-red-500/40'
                  : 'bg-white/5';
            return (
              <li
                key={p.id}
                className={`flex justify-between items-center py-2 px-3 rounded transition-colors duration-500 ${flashClass}`}
              >
                <span className="text-jeopardy-cream font-medium">{p.name}</span>
                <span
                  className={`font-bold tabular-nums ${
                    p.score < 0 ? 'text-red-400' : 'text-jeopardy-gold'
                  }`}
                >
                  ${p.score.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
