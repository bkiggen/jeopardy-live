import { useEffect, useRef, useState } from 'react';
import { useHostContext } from '../context/HostContext';
import { useRoom } from '../context/RoomContext';
import { useSettings } from '../hooks/useSettings';
import { ClueModal } from './ClueModal';

export function GameBoard() {
  const { playClip, speakLive } = useHostContext();
  const { isHost, game, scores, actions } = useRoom();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);

  const round = game.round;
  const usedClueIds = new Set(game.usedClueIds);
  const activeClue = game.activeClue;
  const allDone = round !== null && round.clues.every((c) => usedClueIds.has(c.id));

  // Round-complete sting — host only, fires once on transition
  const wasDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !wasDoneRef.current) {
      wasDoneRef.current = true;
      if (isHost) void playClip('round-complete');
    }
    if (!allDone) wasDoneRef.current = false;
  }, [allDone, isHost, playClip]);

  // Host welcome line — fires once when host lands in the room with no round.
  // Autoplay typically allows it because the host arrived via a click on the
  // landing page; if blocked, it'll fail silently.
  const welcomedRef = useRef(false);
  useEffect(() => {
    if (isHost && !round && !welcomedRef.current) {
      welcomedRef.current = true;
      void playClip('welcome');
    }
  }, [isHost, round, playClip]);

  async function handleStartRound(type: 'single' | 'double') {
    setLoading(true);
    try {
      const resp = await actions.startRound(type);
      if (resp.ok) {
        void playClip(type === 'single' ? 'round-single' : 'round-double');
      } else {
        console.error('start round failed:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePickClue(clueId: number) {
    if (!isHost) return;
    const resp = await actions.revealClue(clueId);
    if (!resp.ok) {
      console.error('reveal clue failed:', resp.error);
      return;
    }
    if (settings.moneyBurningMode) {
      const clue = round?.clues.find((c) => c.id === clueId);
      if (clue) void speakLive(clue.question);
    }
  }

  if (!round) {
    if (!isHost) {
      return (
        <div className="flex-1 rounded-lg bg-jeopardy-navy p-12 flex flex-col items-center justify-center gap-4 border-2 border-jeopardy-gold/30">
          <h2 className="font-display text-jeopardy-gold text-4xl tracking-wider text-shadow-tile">
            WAITING FOR HOST
          </h2>
          <p className="text-jeopardy-cream/60 italic">
            The host will start a round shortly.
          </p>
        </div>
      );
    }
    return (
      <div className="flex-1 rounded-lg bg-jeopardy-navy p-12 flex flex-col items-center justify-center gap-8 border-2 border-jeopardy-gold/30">
        <h2 className="font-display text-jeopardy-gold text-6xl tracking-wider text-shadow-tile">
          START A ROUND
        </h2>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleStartRound('single')}
            disabled={loading}
            className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream disabled:opacity-50 transition-colors"
          >
            Single Jeopardy
          </button>
          <button
            type="button"
            onClick={() => handleStartRound('double')}
            disabled={loading}
            className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream disabled:opacity-50 transition-colors"
          >
            Double Jeopardy
          </button>
        </div>
        {loading && <p className="text-jeopardy-cream/60 italic">Drawing a category…</p>}
      </div>
    );
  }

  if (allDone) {
    const ranking = [...scores].sort((a, b) => b.score - a.score);
    const winner = ranking[0];
    return (
      <div className="flex-1 rounded-lg bg-jeopardy-navy p-12 flex flex-col items-center justify-center gap-8 border-2 border-jeopardy-gold/30">
        <h2 className="font-display text-jeopardy-gold text-6xl tracking-wider text-shadow-tile">
          ROUND COMPLETE
        </h2>
        <p className="text-jeopardy-cream/80 uppercase tracking-widest">
          {round.category}
        </p>
        {winner && (
          <div className="text-center">
            <p className="text-jeopardy-cream/60 text-sm uppercase tracking-widest mb-1">
              Leading
            </p>
            <p className="font-display text-white text-5xl tracking-wide text-shadow-clue">
              {winner.name}
            </p>
            <p className="font-display text-jeopardy-gold text-4xl mt-2">
              ${winner.score.toLocaleString()}
            </p>
          </div>
        )}
        {isHost && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => actions.resetRound()}
              className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream transition-colors"
            >
              Start New Round
            </button>
            <button
              type="button"
              onClick={() => playClip('goodbye')}
              className="px-8 py-4 bg-white/10 text-jeopardy-cream rounded font-display text-2xl tracking-wide hover:bg-white/20 transition-colors"
            >
              End Game
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-4 border-2 border-jeopardy-gold/30">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-jeopardy-gold text-4xl tracking-wider uppercase text-shadow-tile">
          {round.category}
        </h2>
        {activeClue ? (
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-display text-jeopardy-gold text-4xl tracking-wider">
              ${activeClue.value}
            </span>
            {isHost && (
              <button
                type="button"
                onClick={() => actions.closeClue()}
                aria-label="Close clue"
                className="text-jeopardy-cream/60 hover:text-jeopardy-cream text-2xl px-2"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <span className="text-jeopardy-cream/40 text-xs uppercase tracking-widest">
            {round.type === 'single' ? 'Single' : 'Double'} · show #{round.showNumber}
          </span>
        )}
      </div>

      {activeClue ? (
        <ClueModal />
      ) : (
        <div className="flex-1 flex items-center">
          <div className="grid grid-cols-5 gap-3 w-full">
            {round.clues.map((c) => {
              const used = usedClueIds.has(c.id);
              const interactive = isHost && !used;
              return (
                <button
                  type="button"
                  key={c.id}
                  disabled={!interactive}
                  onClick={() => handlePickClue(c.id)}
                  className={`rounded-lg font-display tracking-wider h-40 flex items-center justify-center transition-all duration-150 ${
                    used
                      ? 'bg-jeopardy-navy-darker/60 text-transparent cursor-not-allowed'
                      : interactive
                        ? 'bg-jeopardy-navy-deep text-jeopardy-gold text-5xl text-shadow-tile hover:bg-blue-700 hover:scale-[1.03] active:scale-95 cursor-pointer shadow-inner'
                        : 'bg-jeopardy-navy-deep text-jeopardy-gold text-5xl text-shadow-tile cursor-default'
                  }`}
                >
                  {used ? '·' : `$${c.value}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
