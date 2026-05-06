import { useCallback, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { stripHtml } from '../api';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useHost() {
  const { amplitude, connectAudio, stop } = useAudioAnalyzer();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback(
    async (text: string) => {
      const clean = stripHtml(text);
      if (!clean) return;
      setIsSpeaking(true);
      try {
        const res = await fetch(`${API_URL}/api/host/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean }),
        });
        if (!res.ok) {
          // Degrade silently — game flow shouldn't block on TTS being unavailable.
          console.warn(`speak ${res.status}; continuing without audio`);
          return;
        }
        const buf = await res.arrayBuffer();
        await connectAudio(buf);
      } catch (err) {
        console.warn('speak failed; continuing without audio:', err);
      } finally {
        setIsSpeaking(false);
      }
    },
    [connectAudio],
  );

  return { speak, amplitude, isSpeaking, stop };
}
