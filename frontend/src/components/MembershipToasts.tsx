import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../context/RoomContext';

type Toast = { id: number; text: string; kind: 'join' | 'leave' };

const TOAST_TTL = 3000;

export function MembershipToasts() {
  const { members } = useRoom();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevRef = useRef<Map<string, string>>(new Map());
  const idRef = useRef(0);
  const seededRef = useRef(false);

  useEffect(() => {
    const current = new Map(
      members.map((m) => [m.socketId, m.name ?? (m.isHost ? 'Host' : 'A player')]),
    );

    if (!seededRef.current) {
      // Don't fire toasts for whoever was already there when we joined
      seededRef.current = true;
      prevRef.current = current;
      return;
    }

    const next: Toast[] = [];
    for (const [socketId, name] of current) {
      if (!prevRef.current.has(socketId)) {
        next.push({ id: idRef.current++, text: `${name} joined`, kind: 'join' });
      }
    }
    for (const [socketId, name] of prevRef.current) {
      if (!current.has(socketId)) {
        next.push({ id: idRef.current++, text: `${name} left`, kind: 'leave' });
      }
    }
    if (next.length > 0) setToasts((prev) => [...prev, ...next]);
    prevRef.current = current;
  }, [members]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, TOAST_TTL);
    return () => clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded shadow-lg text-sm font-medium animate-clue-in ${
            t.kind === 'join'
              ? 'bg-green-600/80 text-white border border-green-400/40'
              : 'bg-white/10 text-jeopardy-cream border border-white/20'
          }`}
        >
          {t.kind === 'join' ? '→ ' : '← '}
          {t.text}
        </div>
      ))}
    </div>
  );
}
