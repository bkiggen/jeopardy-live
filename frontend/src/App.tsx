import { useCallback, useEffect, useState } from 'react';
import { GameBoard } from './components/GameBoard';
import { AdminView } from './components/AdminView';
import { ScoreBoard } from './components/ScoreBoard';
import { CharacterCanvas } from './components/CharacterCanvas';
import { api, type Player } from './api';

type View = 'game' | 'admin';

export type LastAdjust = {
  playerId: number;
  playerName: string;
  delta: number;
};

function App() {
  const [view, setView] = useState<View>('game');
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastAdjust, setLastAdjust] = useState<LastAdjust | null>(null);

  const refreshPlayers = useCallback(async () => {
    try {
      setPlayers(await api.getPlayers());
    } catch (err) {
      console.error('failed to load players', err);
    }
  }, []);

  useEffect(() => {
    void refreshPlayers();
  }, [refreshPlayers]);

  const award = useCallback(
    async (playerId: number, delta: number) => {
      const player = players.find((p) => p.id === playerId);
      await api.adjustScore(playerId, delta);
      setLastAdjust({
        playerId,
        playerName: player?.name ?? `Player ${playerId}`,
        delta,
      });
      await refreshPlayers();
    },
    [players, refreshPlayers],
  );

  const undo = useCallback(async () => {
    if (!lastAdjust) return;
    await api.adjustScore(lastAdjust.playerId, -lastAdjust.delta);
    setLastAdjust(null);
    await refreshPlayers();
  }, [lastAdjust, refreshPlayers]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-jeopardy-gold/30">
        <h1 className="text-jeopardy-gold text-2xl font-bold tracking-wide">
          STANDUP JEOPARDY
        </h1>
        <nav className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('game')}
            className={`px-3 py-1 rounded ${view === 'game' ? 'bg-jeopardy-gold text-jeopardy-navy-deep' : 'text-jeopardy-cream hover:bg-white/10'}`}
          >
            Game
          </button>
          <button
            type="button"
            onClick={() => setView('admin')}
            className={`px-3 py-1 rounded ${view === 'admin' ? 'bg-jeopardy-gold text-jeopardy-navy-deep' : 'text-jeopardy-cream hover:bg-white/10'}`}
          >
            Admin
          </button>
        </nav>
      </header>

      <main className="flex-1 grid grid-cols-[1fr_320px] gap-4 p-4">
        <section className="flex flex-col gap-4">
          <div className="flex justify-center">
            <CharacterCanvas />
          </div>
          {view === 'game' ? (
            <GameBoard players={players} award={award} />
          ) : (
            <AdminView refreshPlayers={refreshPlayers} />
          )}
        </section>
        <aside>
          <ScoreBoard players={players} lastAdjust={lastAdjust} onUndo={undo} />
        </aside>
      </main>
    </div>
  );
}

export default App;
