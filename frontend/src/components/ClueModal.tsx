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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
      <div className="bg-jeopardy-navy rounded-lg p-8 max-w-3xl w-full border-2 border-jeopardy-gold/40 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <span className="text-jeopardy-gold text-3xl font-bold">
            ${clue.value}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-jeopardy-cream/60 hover:text-jeopardy-cream"
          >
            ✕
          </button>
        </div>

        <p className="text-jeopardy-cream text-2xl leading-relaxed mb-6">
          {stripHtmlForDisplay(clue.question)}
        </p>

        {revealed && (
          <p className="text-jeopardy-gold text-2xl font-bold mb-6">
            {clue.answer}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {!revealed && (
            <button
              type="button"
              onClick={() => speak(clue.question)}
              className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20"
            >
              ↻ Re-read
            </button>
          )}
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
            >
              Reveal Answer
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
            >
              Skip — Nobody
            </button>
          )}
        </div>

        {revealed && players.length > 0 && (
          <div className="border-t border-jeopardy-gold/20 pt-4">
            <p className="text-jeopardy-cream/70 text-sm mb-3">
              Award points (closes after each):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white/5 rounded px-3 py-2"
                >
                  <span className="text-jeopardy-cream font-medium">
                    {p.name}
                  </span>
                  <div className="flex gap-1">
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
