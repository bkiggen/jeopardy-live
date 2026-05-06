import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoom } from '../context/RoomContext';
import { leaderPenalty } from '../lib/penalty';
import type { RoomScore } from '../api';

type Flash = 'up' | 'down' | undefined;

function asPlayerLikes(scores: RoomScore[]) {
  return scores.map((s) => ({
    id: s.playerId,
    name: s.name,
    score: s.score,
  }));
}

export function ScoreBoard() {
  const { isHost, scores, lastAdjust, actions, members, socketId } = useRoom();
  const players = asPlayerLikes(scores);
  const myPlayerId = members.find((m) => m.socketId === socketId)?.playerId ?? null;
  const inRoomIds = useMemo(
    () =>
      new Set(
        members
          .filter((m): m is typeof m & { playerId: number } => m.playerId !== null)
          .map((m) => m.playerId),
      ),
    [members],
  );
  // Sort purely by score, descending. Active status is shown visually but
  // doesn't affect ordering.
  const orderedPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players],
  );
  const prev = useRef<Map<number, number>>(new Map());
  const [flash, setFlash] = useState<Map<number, Flash>>(new Map());
  const [undoing, setUndoing] = useState(false);

  const penalty = useMemo(() => leaderPenalty(players), [players]);

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
      const resp = await actions.undoScore();
      if (!resp.ok) console.error('undo failed:', resp.error);
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="rounded-lg bg-jeopardy-navy p-4 h-full flex flex-col gap-3 border-2 border-jeopardy-gold/30">
      <h2 className="font-display text-jeopardy-gold text-2xl tracking-widest text-shadow-tile">
        SCORES
      </h2>

      {isHost && lastAdjust && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoing}
          className="text-sm px-3 py-2 bg-white/10 hover:bg-white/20 text-jeopardy-cream rounded flex items-center justify-between disabled:opacity-50 transition-colors"
        >
          <span className="font-bold">↶ Undo</span>
          <span className="text-jeopardy-cream/70 text-xs">
            {lastAdjust.delta >= 0 ? '+' : '−'}$
            {Math.abs(lastAdjust.delta).toLocaleString()}{' '}
            {lastAdjust.delta >= 0 ? 'to' : 'from'} {lastAdjust.playerName}
          </span>
        </button>
      )}

      {orderedPlayers.length === 0 ? (
        <p className="text-jeopardy-cream/60 text-sm">
          No active players. Add some in the Admin tab.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orderedPlayers.map((p) => {
            const f = flash.get(p.id);
            const inRoom = inRoomIds.has(p.id);
            const baseBg = inRoom ? 'bg-white/5' : 'bg-white/[0.02]';
            const flashClass =
              f === 'up' ? 'bg-green-500/40' : f === 'down' ? 'bg-red-500/40' : baseBg;
            const isPenaltyTarget = penalty.active && p.id === penalty.leaderId;
            const isMe = p.id === myPlayerId;
            const meClass = isMe
              ? 'ring-2 ring-jeopardy-gold ring-offset-2 ring-offset-jeopardy-navy shadow-[0_0_12px_rgba(212,175,55,0.4)]'
              : '';
            const dim = inRoom ? '' : 'opacity-50';
            return (
              <li
                key={p.id}
                className={`flex justify-between items-center py-2 px-3 rounded transition-colors duration-500 ${flashClass} ${meClass} ${dim}`}
              >
                <span className="text-jeopardy-cream font-medium truncate flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      inRoom ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]' : 'bg-transparent'
                    }`}
                    aria-label={inRoom ? 'in room' : 'not in room'}
                  />
                  {isPenaltyTarget && (
                    <span
                      className="text-yellow-400 text-xs"
                      title={`Wrong answers deduct points until score < $${penalty.threshold.toLocaleString()}`}
                    >
                      ⚡
                    </span>
                  )}
                  {p.name}
                  {isMe && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-jeopardy-navy bg-jeopardy-gold rounded px-1.5 py-0.5">
                      You
                    </span>
                  )}
                </span>
                <span
                  className={`font-display text-xl tracking-wide tabular-nums ml-2 shrink-0 ${
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

      {penalty.active && (
        <p className="text-yellow-300/70 text-[10px] uppercase tracking-widest border-t border-jeopardy-gold/20 pt-2">
          ⚡ Leader penalty active — wrong answers deduct
        </p>
      )}
    </div>
  );
}
