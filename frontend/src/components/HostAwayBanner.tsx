import { useEffect, useState } from 'react';
import { useRoom } from '../context/RoomContext';

const GRACE_MS = 60_000;

export function HostAwayBanner() {
  const { hostConnected, hostDisconnectedAt } = useRoom();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (hostConnected) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hostConnected]);

  if (hostConnected || hostDisconnectedAt === null) return null;

  const elapsed = now - hostDisconnectedAt;
  const remaining = Math.max(0, Math.ceil((GRACE_MS - elapsed) / 1000));

  return (
    <div className="bg-yellow-600/30 border-b-2 border-yellow-500/50 px-6 py-2 flex items-center justify-between text-yellow-100 text-sm">
      <span className="font-bold uppercase tracking-widest">
        ⚠ Host disconnected
      </span>
      <span className="text-yellow-200/80 text-xs">
        Room closes in {remaining}s if they don't return
      </span>
    </div>
  );
}
