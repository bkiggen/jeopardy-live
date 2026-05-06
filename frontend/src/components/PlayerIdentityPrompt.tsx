import { useRoom } from '../context/RoomContext';

export function PlayerIdentityPrompt() {
  const { isHost, scores, actions, socketId, members } = useRoom();

  if (isHost) return null;

  const me = socketId ? members.find((m) => m.socketId === socketId) : undefined;
  if (me?.playerId) return null;

  // Hide if no players exist yet (room hasn't loaded scores or there are none)
  if (scores.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-40">
        <div className="bg-jeopardy-navy rounded-lg w-full max-w-md border-4 border-jeopardy-gold/60 p-6 text-center">
          <h2 className="font-display text-jeopardy-gold text-3xl tracking-widest mb-3">
            NO PLAYERS YET
          </h2>
          <p className="text-jeopardy-cream/70 text-sm">
            Ask the host to add players in the Admin tab before joining.
          </p>
        </div>
      </div>
    );
  }

  // Players already claimed by other connected members
  const claimedIds = new Set(
    members.filter((m) => m.playerId !== null).map((m) => m.playerId as number),
  );

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-40">
      <div className="bg-jeopardy-navy rounded-lg w-full max-w-md border-4 border-jeopardy-gold/60 p-6 flex flex-col gap-4">
        <h2 className="font-display text-jeopardy-gold text-3xl tracking-widest text-shadow-tile">
          WHO ARE YOU?
        </h2>
        <p className="text-jeopardy-cream/70 text-sm">
          Tap your name. Scores attach to your player ID.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {scores.map((s) => {
            const claimed = claimedIds.has(s.playerId);
            return (
              <button
                type="button"
                key={s.playerId}
                disabled={claimed}
                onClick={() => actions.identifyPlayer(s.playerId)}
                className={`px-3 py-3 rounded font-bold text-lg transition-colors ${
                  claimed
                    ? 'bg-white/5 text-jeopardy-cream/30 cursor-not-allowed'
                    : 'bg-jeopardy-gold text-jeopardy-navy-deep hover:bg-jeopardy-cream'
                }`}
              >
                {s.name}
                {claimed && (
                  <span className="block text-[10px] uppercase tracking-wider mt-1">
                    in use
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
