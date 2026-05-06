import { useState } from 'react';
import type { Clue, Player } from '../api';
import { useHostContext } from '../context/HostContext';

type Props = {
  clue: Clue;
  players: Player[];
  award: (playerId: number, delta: number) => Promise<void>;
  onClose: () => void;
};

export function ClueModal({ clue, players, award, onClose }: Props) {
  const { speak } = useHostContext();
  const [revealed, setRevealed] = useState(false);
  const [scoringId, setScoringId] = useState<number | null>(null);

  async function handleAward(playerId: number, delta: number) {
    setScoringId(playerId);
    try {
      await award(playerId, delta);
      onClose();
    } finally {
      setScoringId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50">
      <div className="bg-jeopardy-navy rounded-lg w-full max-w-5xl border-4 border-jeopardy-gold/60 shadow-2xl animate-clue-in flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-3 border-b-2 border-jeopardy-gold/40">
          <span className="font-display text-jeopardy-gold text-5xl tracking-wider">
            ${clue.value}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close clue"
            className="text-jeopardy-cream/60 hover:text-jeopardy-cream text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12 text-center overflow-y-auto">
          <p className="font-display text-white text-shadow-clue uppercase leading-tight tracking-wide text-3xl sm:text-5xl md:text-6xl">
            {stripHtmlForDisplay(clue.question)}
          </p>
        </div>

        {revealed && (
          <div className="px-8 pb-6 text-center border-t border-jeopardy-gold/20 pt-6">
            <p className="text-jeopardy-cream/60 text-xs uppercase tracking-widest mb-2">
              Answer
            </p>
            <p className="font-display text-jeopardy-gold text-4xl uppercase tracking-wide">
              {clue.answer}
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-t-2 border-jeopardy-gold/40 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => speak(clue.question)}
            className="px-3 py-2 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
          >
            ↻ Re-read
          </button>
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="ml-auto px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
            >
              Reveal Answer
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-5 py-2 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
            >
              Skip — nobody got it
            </button>
          )}
        </div>

        {revealed && players.length > 0 && (
          <div className="px-6 pb-5 border-t border-jeopardy-gold/20 pt-4">
            <p className="text-jeopardy-cream/60 text-xs uppercase tracking-widest mb-3">
              Award points
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white/5 rounded px-3 py-2"
                >
                  <span className="text-jeopardy-cream font-medium truncate">
                    {p.name}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={scoringId !== null}
                      onClick={() => handleAward(p.id, clue.value)}
                      className="px-2 py-1 bg-green-600/40 hover:bg-green-600/70 text-white rounded text-sm font-mono disabled:opacity-40"
                    >
                      +{clue.value}
                    </button>
                    <button
                      type="button"
                      disabled={scoringId !== null}
                      onClick={() => handleAward(p.id, -clue.value)}
                      className="px-2 py-1 bg-red-600/40 hover:bg-red-600/70 text-white rounded text-sm font-mono disabled:opacity-40"
                    >
                      −{clue.value}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function stripHtmlForDisplay(s: string): string {
  return s.replace(/<a[^>]*>(.*?)<\/a>/g, '$1').replace(/<[^>]+>/g, '');
}
