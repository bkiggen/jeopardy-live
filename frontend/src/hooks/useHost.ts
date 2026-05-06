import { useCallback, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { getPasscode, stripHtml } from '../api';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export type SoundClip =
  | 'round-single'
  | 'round-double'
  | 'round-complete'
  | 'correct'
  | 'incorrect'
  | 'penalty'
  | 'goodbye';

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

export function useHost(voice: string) {
  const { amplitude, connectAudio, stop } = useAudioAnalyzer();
  const [isPlaying, setIsPlaying] = useState(false);

  const playClip = useCallback(
    async (name: SoundClip) => {
      const file = pickFile(name);
      setIsPlaying(true);
      try {
        const res = await fetch(`/audio/${voice}/${file}.mp3`);
        if (!res.ok) {
          console.warn(`audio missing: /audio/${voice}/${file}.mp3`);
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
    [connectAudio, voice],
  );

  // Live ElevenLabs synthesis — only called when "money-burning mode" is on.
  // Server picks the voice from settings, so no voice param here.
  const speakLive = useCallback(
    async (text: string) => {
      const clean = stripHtml(text);
      if (!clean) return;
      setIsPlaying(true);
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
          console.warn(`speakLive ${res.status}; continuing without audio`, detail);
          return;
        }
        const buf = await res.arrayBuffer();
        await connectAudio(buf);
      } catch (err) {
        console.warn('speakLive failed; continuing without audio:', err);
      } finally {
        setIsPlaying(false);
      }
    },
    [connectAudio],
  );

  return { playClip, speakLive, amplitude, isPlaying, stop };
}
