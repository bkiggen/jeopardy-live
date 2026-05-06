import { useEffect, useRef } from 'react';

// Simple 30-second synth tune to play during the Final Jeopardy answer phase.
// Distinct melody from the copyrighted "Think!" theme but the same anxious
// march cadence. Square-wave bleeps with a soft envelope, no rights issues.

type Note = { freq: number; durMs: number };

const D4 = 293.66;
const E4 = 329.63;
const Fs4 = 369.99;
const G4 = 392.0;
const A4 = 440.0;
const B4 = 493.88;
const Cs5 = 554.37;
const D5 = 587.33;

const SHORT = 250; // eighth note at ~120 BPM
const LONG = 500;  // quarter

// Two-bar motif (4 sec). Loops to fill the 30-second window.
const MOTIF: Note[] = [
  { freq: D4, durMs: SHORT },
  { freq: D4, durMs: SHORT },
  { freq: Fs4, durMs: SHORT },
  { freq: A4, durMs: SHORT },
  { freq: D4, durMs: SHORT },
  { freq: A4, durMs: SHORT },
  { freq: Fs4, durMs: SHORT },
  { freq: D4, durMs: SHORT },
  { freq: E4, durMs: SHORT },
  { freq: E4, durMs: SHORT },
  { freq: G4, durMs: SHORT },
  { freq: B4, durMs: SHORT },
  { freq: A4, durMs: LONG },
  { freq: Fs4, durMs: LONG },
];

// 8th repetition shifts up to a final flourish so the loop doesn't sound static.
const FINISH: Note[] = [
  { freq: D4, durMs: SHORT },
  { freq: Fs4, durMs: SHORT },
  { freq: A4, durMs: SHORT },
  { freq: D5, durMs: SHORT },
  { freq: Cs5, durMs: SHORT },
  { freq: A4, durMs: SHORT },
  { freq: Fs4, durMs: SHORT },
  { freq: D4, durMs: LONG },
];

function buildTimeline(): Note[] {
  // 7 motifs (28s) + finish (2.5s) ≈ 30.5s — close enough to 30.
  const timeline: Note[] = [];
  for (let i = 0; i < 7; i++) timeline.push(...MOTIF);
  timeline.push(...FINISH);
  return timeline;
}

let sharedCtx: AudioContext | null = null;
function ensureCtx(): AudioContext {
  if (sharedCtx) return sharedCtx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  sharedCtx = new Ctor();
  return sharedCtx;
}

export function useFinalTheme(active: boolean): void {
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }
    const ctx = ensureCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);

    const oscs: OscillatorNode[] = [];
    const notes = buildTimeline();
    let t = ctx.currentTime + 0.05;
    for (const n of notes) {
      const dur = n.durMs / 1000;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = n.freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur - 0.02);
      o.connect(env).connect(master);
      o.start(t);
      o.stop(t + dur);
      oscs.push(o);
      t += dur;
    }

    stopRef.current = () => {
      for (const o of oscs) {
        try {
          o.stop();
        } catch {
          // already stopped
        }
      }
      try {
        master.disconnect();
      } catch {
        // ignore
      }
    };

    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [active]);
}
