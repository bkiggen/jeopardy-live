import { useCallback, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';

export type SoundClip =
  | 'round-single'
  | 'round-double'
  | 'round-complete'
  | 'correct'
  | 'incorrect'
  | 'penalty';

const VARIANTS: Partial<Record<SoundClip, string[]>> = {
  correct: ['correct-1', 'correct-2', 'correct-3'],
  incorrect: ['incorrect-1', 'incorrect-2', 'incorrect-3'],
};

function pickFile(name: SoundClip): string {
  const variants = VARIANTS[name];
  if (variants?.length) {
    return variants[Math.floor(Math.random() * variants.length)];
  }
  return name;
}

export function useHost() {
  const { amplitude, connectAudio, stop } = useAudioAnalyzer();
  const [isPlaying, setIsPlaying] = useState(false);

  const playClip = useCallback(
    async (name: SoundClip) => {
      const file = pickFile(name);
      setIsPlaying(true);
      try {
        const res = await fetch(`/audio/${file}.mp3`);
        if (!res.ok) {
          console.warn(`audio missing: ${file}.mp3`);
          return;
        }
        const buf = await res.arrayBuffer();
        await connectAudio(buf);
      } catch (err) {
        console.warn(`failed to play ${name}:`, err);
      } finally {
        setIsPlaying(false);
      }
    },
    [connectAudio],
  );

  return { playClip, amplitude, isPlaying, stop };
}
