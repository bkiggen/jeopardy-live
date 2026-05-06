import { useRef, useState } from 'react';

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

  const connectAudio = (audioBuffer: ArrayBuffer): Promise<void> => {
    stop();
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
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

  return { amplitude, connectAudio, stop };
}
