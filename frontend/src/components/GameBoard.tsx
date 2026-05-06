import { useState } from 'react';
import { api, type Clue, type Player, type RoundData } from '../api';
import { useHostContext } from '../context/HostContext';
import { ClueModal } from './ClueModal';

type Round = 'single' | 'double';

type Props = {
  players: Player[];
  award: (playerId: number, delta: number) => Promise<void>;
};

export function GameBoard({ players, award }: Props) {
  const { speak } = useHostContext();
  const [round, setRound] = useState<RoundData | null>(null);
  const [usedClueIds, setUsedClueIds] = useState<Set<number>>(new Set());
  const [activeClue, setActiveClue] = useState<Clue | null>(null);
  const [loading, setLoading] = useState(false);

  async function startRound(r: Round) {
    setLoading(true);
    try {
      const data = await api.getRandomCategory(r);
      setRound(data);
      setUsedClueIds(new Set());
      setActiveClue(null);
      void speak(`Today's category is, ${data.category}`);
    } finally {
      setLoading(false);
    }
  }

  function pickClue(clue: Clue) {
    setActiveClue(clue);
    void speak(clue.question);
  }

  function closeClue() {
    if (activeClue) {
      setUsedClueIds((prev) => new Set(prev).add(activeClue.id));
    }
    setActiveClue(null);
  }

  const allDone = round && round.clues.every((c) => usedClueIds.has(c.id));

  if (!round) {
    return (
      <div className="flex-1 rounded-lg bg-jeopardy-navy p-8 flex flex-col items-center justify-center gap-6">
        <h2 className="text-jeopardy-gold text-3xl font-bold">START A ROUND</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => startRound('single')}
            disabled={loading}
            className="px-6 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80 disabled:opacity-50"
          >
            Single Jeopardy
          </button>
          <button
            type="button"
            onClick={() => startRound('double')}
            disabled={loading}
            className="px-6 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80 disabled:opacity-50"
          >
            Double Jeopardy
          </button>
        </div>
        {loading && <p className="text-jeopardy-cream/60">Drawing a category…</p>}
      </div>
    );
  }

  if (allDone) {
    return (
      <div className="flex-1 rounded-lg bg-jeopardy-navy p-8 flex flex-col items-center justify-center gap-6">
        <h2 className="text-jeopardy-gold text-3xl font-bold">ROUND COMPLETE</h2>
        <p className="text-jeopardy-cream/80">{round.category}</p>
        <button
          type="button"
          onClick={() => setRound(null)}
          className="px-6 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
        >
            Start New Round
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-jeopardy-gold text-2xl font-bold uppercase tracking-wide">
          {round.category}
        </h2>
        <span className="text-jeopardy-cream/50 text-sm">
          {round.round === 'single' ? 'Single' : 'Double'} Jeopardy · show #
          {round.showNumber}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-3 flex-1">
        {round.clues.map((c) => {
          const used = usedClueIds.has(c.id);
          return (
            <button
              type="button"
              key={c.id}
              disabled={used}
              onClick={() => pickClue(c)}
              className={`rounded-lg text-jeopardy-gold font-display text-4xl py-12 transition-all ${
                used
                  ? 'bg-jeopardy-navy-deep/40 text-jeopardy-cream/20 cursor-not-allowed'
                  : 'bg-jeopardy-navy-deep hover:bg-blue-900 hover:scale-105 cursor-pointer'
              }`}
            >
              {used ? '' : `$${c.value}`}
            </button>
          );
        })}
      </div>

      {activeClue && (
        <ClueModal
          clue={activeClue}
          players={players}
          award={award}
          onClose={closeClue}
        />
      )}
    </div>
  );
}
