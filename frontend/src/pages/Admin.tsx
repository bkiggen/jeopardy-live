import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminView } from '../components/AdminView';
import { api, type Season } from '../api';

export function Admin() {
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);

  const refreshSeason = useCallback(async () => {
    try {
      const seasons = await api.getSeasons();
      setActiveSeason(seasons.find((s) => s.isActive) ?? null);
    } catch (err) {
      console.error('failed to load seasons', err);
    }
  }, []);

  useEffect(() => {
    void refreshSeason();
  }, [refreshSeason]);

  // AdminView fetches its own data; we just need a callback for refreshes.
  const onAdminChange = useCallback(async () => {
    await refreshSeason();
  }, [refreshSeason]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b-2 border-jeopardy-gold/40 bg-jeopardy-navy-darker">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="font-display text-jeopardy-gold text-3xl tracking-widest text-shadow-tile hover:opacity-80"
          >
            STANDUP JEOPARDY
          </Link>
          {activeSeason && (
            <span className="px-2 py-0.5 rounded border border-jeopardy-gold/50 text-jeopardy-gold/80 text-xs uppercase tracking-widest">
              {activeSeason.name}
            </span>
          )}
          <span className="px-2 py-0.5 rounded border border-jeopardy-gold/50 text-jeopardy-gold/80 text-xs uppercase tracking-widest">
            admin
          </span>
        </div>
        <Link
          to="/"
          className="text-jeopardy-cream/70 hover:text-jeopardy-cream text-sm"
        >
          ← Back
        </Link>
      </header>
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        <AdminView refreshPlayers={onAdminChange} />
      </main>
    </div>
  );
}
