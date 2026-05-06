import { useCallback, useEffect, useState } from 'react';
import { GameBoard } from './components/GameBoard';
import { AdminView } from './components/AdminView';
import { ScoreBoard } from './components/ScoreBoard';
import { CharacterCanvas } from './components/CharacterCanvas';
import { api, type Player, type Season } from './api';
import { usePasscode } from './context/PasscodeContext';

type View = 'game' | 'admin';

export type LastAdjust = {
  playerId: number;
  playerName: string;
  delta: number;
};

function App() {
  const { callProtected } = usePasscode();
  const [view, setView] = useState<View>('game');
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [lastAdjust, setLastAdjust] = useState<LastAdjust | null>(null);

  const refreshPlayers = useCallback(async () => {
    try {
      setPlayers(await api.getPlayers());
    } catch (err) {
      console.error('failed to load players', err);
    }
  }, []);

  const refreshSeason = useCallback(async () => {
    try {
      const seasons = await api.getSeasons();
      setActiveSeason(seasons.find((s) => s.isActive) ?? null);
    } catch (err) {
      console.error('failed to load seasons', err);
    }
  }, []);

  useEffect(() => {
    void refreshPlayers();
    void refreshSeason();
  }, [refreshPlayers, refreshSeason]);

  const award = useCallback(
    async (playerId: number, delta: number) => {
      const player = players.find((p) => p.id === playerId);
      const result = await callProtected(
        () => api.adjustScore(playerId, delta),
        { message: 'Enter the host passcode to award points.' },
      );
      if (result == null) return;
      setLastAdjust({
        playerId,
        playerName: player?.name ?? `Player ${playerId}`,
        delta,
      });
      await refreshPlayers();
    },
    [callProtected, players, refreshPlayers],
  );

  const undo = useCallback(async () => {
    if (!lastAdjust) return;
    const result = await callProtected(() =>
      api.adjustScore(lastAdjust.playerId, -lastAdjust.delta),
    );
    if (result == null) return;
    setLastAdjust(null);
    await refreshPlayers();
  }, [callProtected, lastAdjust, refreshPlayers]);

  const onAdminChange = useCallback(async () => {
    await Promise.all([refreshPlayers(), refreshSeason()]);
  }, [refreshPlayers, refreshSeason]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b-2 border-jeopardy-gold/40 bg-jeopardy-navy-darker">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-jeopardy-gold text-3xl tracking-widest text-shadow-tile">
            STANDUP JEOPARDY
          </h1>
          {activeSeason && (
            <span className="px-2 py-0.5 rounded border border-jeopardy-gold/50 text-jeopardy-gold/80 text-xs uppercase tracking-widest">
              {activeSeason.name}
            </span>
          )}
        </div>
        <nav className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('game')}
            className={`px-4 py-1 rounded font-bold uppercase tracking-wider text-sm ${view === 'game' ? 'bg-jeopardy-gold text-jeopardy-navy-deep' : 'text-jeopardy-cream hover:bg-white/10'}`}
          >
            Game
          </button>
          <button
            type="button"
            onClick={() => setView('admin')}
            className={`px-4 py-1 rounded font-bold uppercase tracking-wider text-sm ${view === 'admin' ? 'bg-jeopardy-gold text-jeopardy-navy-deep' : 'text-jeopardy-cream hover:bg-white/10'}`}
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
            <AdminView refreshPlayers={onAdminChange} />
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
