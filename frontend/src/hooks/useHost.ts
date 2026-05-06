import { useCallback, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { getPasscode, stripHtml } from '../api';

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
        const passcode = getPasscode();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (passcode) headers['x-app-passcode'] = passcode;

        const res = await fetch(`${API_URL}/api/host/speak`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: clean }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          console.warn(`speak ${res.status}; continuing without audio`, detail);
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
