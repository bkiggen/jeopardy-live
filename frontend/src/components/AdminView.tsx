import { useState } from 'react';
import { api, type Player } from '../api';

type Props = {
  players: Player[];
  refreshPlayers: () => Promise<void>;
};

export function AdminView({ players, refreshPlayers }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.addPlayer(name.trim());
      setName('');
      await refreshPlayers();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Player) {
    setBusy(true);
    try {
      await api.togglePlayer(p.id, !p.isActive);
      await refreshPlayers();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-jeopardy-gold text-xl font-bold mb-3">ADD PLAYER</h2>
        <form onSubmit={add} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-jeopardy-gold text-xl font-bold mb-3">PLAYERS</h2>
        {players.length === 0 ? (
          <p className="text-jeopardy-cream/60 text-sm">No active players yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between bg-white/5 rounded px-3 py-2"
              >
                <span className="text-jeopardy-cream font-medium">{p.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  disabled={busy}
                  className="px-3 py-1 bg-red-600/40 hover:bg-red-600/70 text-white rounded text-sm disabled:opacity-50"
                >
                  Deactivate
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-jeopardy-cream/40 text-xs mt-3">
          (Reactivation + season management coming in Phase 8.)
        </p>
      </div>
    </div>
  );
}
