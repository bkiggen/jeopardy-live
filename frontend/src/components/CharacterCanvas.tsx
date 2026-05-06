import { useEffect, useRef } from 'react';
import { useHostContext } from '../context/HostContext';

const W = 320;
const H = 400;

export function CharacterCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { amplitude, isSpeaking } = useHostContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0f5c';
    ctx.fillRect(0, 0, W, H);

    // Head (placeholder until sprites ship)
    ctx.fillStyle = '#d69f4c';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2 - 20, 90, 110, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#0a0f5c';
    ctx.beginPath();
    ctx.arc(W / 2 - 30, H / 2 - 40, 6, 0, Math.PI * 2);
    ctx.arc(W / 2 + 30, H / 2 - 40, 6, 0, Math.PI * 2);
    ctx.fill();

    // Mouth — height scales with amplitude
    const mouthH = 4 + Math.round(amplitude * 60);
    const mouthW = 50 + Math.round(amplitude * 30);
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2 + 20, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Status label
    ctx.fillStyle = '#f5e9c4';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      isSpeaking ? 'speaking…' : 'host (placeholder sprite)',
      W / 2,
      H - 16,
    );
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
