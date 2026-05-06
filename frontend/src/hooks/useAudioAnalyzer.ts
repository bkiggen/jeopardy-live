import { useCallback, useRef, useState } from 'react';

type ToneOptions = {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
};

export function useAudioAnalyzer() {
  const [amplitude, setAmplitude] = useState(0);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const stop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAmplitude(0);
  };

  function ensureContext(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }

  const connectAudio = (audioBuffer: ArrayBuffer): Promise<void> => {
    stop();
    const ctx = ensureContext();
    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 256;

    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(audioBuffer.slice(0), (buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyzer);
        analyzer.connect(ctx.destination);
        source.start();

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        const tick = () => {
          analyzer.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAmplitude(avg / 255);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();

        source.onended = () => {
          stop();
          resolve();
        };
      }, reject);
    });
  };

  // Synthesized tone for sounds we don't want to bake mp3s for (buzzer, etc.)
  const playTone = useCallback((options: ToneOptions): void => {
    try {
      const ctx = ensureContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = options.type ?? 'sawtooth';
      osc.frequency.setValueAtTime(options.frequency, now);
      const vol = options.volume ?? 0.3;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.02);
      gain.gain.setValueAtTime(vol, now + Math.max(options.duration - 0.05, 0.05));
      gain.gain.linearRampToValueAtTime(0, now + options.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + options.duration);
    } catch (err) {
      console.warn('playTone failed:', err);
    }
  }, []);

  return { amplitude, connectAudio, playTone, stop };
}
