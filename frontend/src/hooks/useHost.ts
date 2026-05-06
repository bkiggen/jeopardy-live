import { useCallback, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useHost() {
  const { amplitude, connectAudio } = useAudioAnalyzer();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback(
    async (text: string) => {
      setIsSpeaking(true);
      try {
        const res = await fetch(`${API_URL}/api/host/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`speak failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        await connectAudio(buf);
      } finally {
        setIsSpeaking(false);
      }
    },
    [connectAudio],
  );

  return { speak, amplitude, isSpeaking };
}
