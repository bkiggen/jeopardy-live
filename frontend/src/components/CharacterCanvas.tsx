import { useEffect, useRef } from 'react';
import { useHost } from '../hooks/useHost';

const W = 400;
const H = 500;

export function CharacterCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { amplitude, isSpeaking } = useHost();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Placeholder until sprites are drawn:
    ctx.fillStyle = '#0a0f5c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d69f4c';
    ctx.fillRect(W / 2 - 80, 100, 160, 200);

    // Mouth — sized by amplitude.
    const mouthH = 4 + Math.round(amplitude * 50);
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(W / 2 - 30, 240 - mouthH / 2, 60, mouthH);

    ctx.fillStyle = '#f5e9c4';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(isSpeaking ? 'speaking…' : 'host (placeholder)', W / 2, H - 20);
  }, [amplitude, isSpeaking]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="rounded-lg border border-jeopardy-gold/40"
    />
  );
}
