import { useState } from 'react';
import { GameBoard } from './components/GameBoard';
import { AdminView } from './components/AdminView';
import { ScoreBoard } from './components/ScoreBoard';
import { CharacterCanvas } from './components/CharacterCanvas';

type View = 'game' | 'admin';

function App() {
  const [view, setView] = useState<View>('game');

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
          {view === 'game' ? <GameBoard /> : <AdminView />}
        </section>
        <aside>
          <ScoreBoard />
        </aside>
      </main>
    </div>
  );
}

export default App;
