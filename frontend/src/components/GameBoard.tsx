import { useState } from 'react';
import { api, type Clue, type Player, type RoundData } from '../api';
import { useHostContext } from '../context/HostContext';
import { usePasscode } from '../context/PasscodeContext';
import { ClueModal } from './ClueModal';

type Round = 'single' | 'double';

type Props = {
  players: Player[];
  award: (playerId: number, delta: number) => Promise<void>;
};

export function GameBoard({ players, award }: Props) {
  const { speak } = useHostContext();
  const { ensurePasscode } = usePasscode();
  const [round, setRound] = useState<RoundData | null>(null);
  const [usedClueIds, setUsedClueIds] = useState<Set<number>>(new Set());
  const [activeClue, setActiveClue] = useState<Clue | null>(null);
  const [loading, setLoading] = useState(false);

  async function startRound(r: Round) {
    const ok = await ensurePasscode({
      message: 'Enter the host passcode to start a round.',
    });
    if (!ok) return;
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
      <div className="flex-1 rounded-lg bg-jeopardy-navy p-12 flex flex-col items-center justify-center gap-8 border-2 border-jeopardy-gold/30">
        <h2 className="font-display text-jeopardy-gold text-6xl tracking-wider text-shadow-tile">
          START A ROUND
        </h2>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => startRound('single')}
            disabled={loading}
            className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream disabled:opacity-50 transition-colors"
          >
            Single Jeopardy
          </button>
          <button
            type="button"
            onClick={() => startRound('double')}
            disabled={loading}
            className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream disabled:opacity-50 transition-colors"
          >
            Double Jeopardy
          </button>
        </div>
        {loading && (
          <p className="text-jeopardy-cream/60 italic">Drawing a category…</p>
        )}
      </div>
    );
  }

  if (allDone) {
    const ranking = [...players].sort((a, b) => b.score - a.score);
    const winner = ranking[0];
    return (
      <div className="flex-1 rounded-lg bg-jeopardy-navy p-12 flex flex-col items-center justify-center gap-8 border-2 border-jeopardy-gold/30">
        <h2 className="font-display text-jeopardy-gold text-6xl tracking-wider text-shadow-tile">
          ROUND COMPLETE
        </h2>
        <p className="text-jeopardy-cream/80 uppercase tracking-widest">
          {round.category}
        </p>
        {winner && players.length > 0 && (
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
        <button
          type="button"
          onClick={() => setRound(null)}
          className="px-8 py-4 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-2xl tracking-wide hover:bg-jeopardy-cream transition-colors"
        >
          Start New Round
        </button>
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
          {round.round === 'single' ? 'Single' : 'Double'} · show #
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
              className={`rounded-lg font-display tracking-wider py-12 transition-all duration-150 ${
                used
                  ? 'bg-jeopardy-navy-darker/60 text-transparent cursor-not-allowed'
                  : 'bg-jeopardy-navy-deep text-jeopardy-gold text-5xl text-shadow-tile hover:bg-blue-700 hover:scale-[1.03] active:scale-95 cursor-pointer shadow-inner'
              }`}
            >
              {used ? '·' : `$${c.value}`}
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
