import { useState } from 'react';
import { useHostContext } from '../context/HostContext';
import { useRoom } from '../context/RoomContext';
import { ClueModal } from './ClueModal';

export function GameBoard() {
  const { speak } = useHostContext();
  const { isHost, game, scores, actions } = useRoom();
  const [loading, setLoading] = useState(false);

  const round = game.round;
  const usedClueIds = new Set(game.usedClueIds);
  const activeClue = game.activeClue;

  async function handleStartRound(type: 'single' | 'double') {
    setLoading(true);
    try {
      const resp = await actions.startRound(type);
      if (!resp.ok) {
        console.error('start round failed:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePickClue(clueId: number, question: string) {
    if (!isHost) return;
    const resp = await actions.revealClue(clueId);
    if (resp.ok) {
      void speak(question);
    } else {
      console.error('reveal clue failed:', resp.error);
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

  const allDone = round.clues.every((c) => usedClueIds.has(c.id));

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
          <button
            type="button"
            onClick={() => actions.resetRound()}
            className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream transition-colors"
          >
            Start New Round
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-4 border-2 border-jeopardy-gold/30">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-jeopardy-gold text-4xl tracking-wider uppercase text-shadow-tile">
          {round.category}
        </h2>
        <span className="text-jeopardy-cream/40 text-xs uppercase tracking-widest">
          {round.type === 'single' ? 'Single' : 'Double'} · show #{round.showNumber}
        </span>
      </div>

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
                onClick={() => handlePickClue(c.id, c.question)}
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

      {activeClue && <ClueModal />}
    </div>
  );
}
