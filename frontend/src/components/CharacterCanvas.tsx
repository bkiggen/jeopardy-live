import { useEffect } from 'react';
import { useHostContext } from '../context/HostContext';

// Six pre-drawn host portraits, ordered by mouth opening
//   0: closed              (idle / between syllables)
//   1: slight open         (consonant / soft vowel)
//   2: medium open
//   3: wide open
//   4: rounded "O"
//   5: resting smile       (used when no clip is playing)
const PANELS: ReadonlyArray<string> = [
  '/face-sprites/panel-1.png',
  '/face-sprites/panel-2.png',
  '/face-sprites/panel-3.png',
  '/face-sprites/panel-4.png',
  '/face-sprites/panel-5.png',
  '/face-sprites/panel-6.png',
];

const REST_PANEL = 5;

function pickPanel(amplitude: number, isPlaying: boolean): number {
  if (!isPlaying) return REST_PANEL;
  if (amplitude < 0.05) return 0;
  if (amplitude < 0.15) return 1;
  if (amplitude < 0.35) return 2;
  if (amplitude < 0.6) return 3;
  return 4;
}

export function CharacterCanvas() {
  const { amplitude, isPlaying } = useHostContext();

  // Preload all panels once so opacity-swaps are instant
  useEffect(() => {
    for (const src of PANELS) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  const active = pickPanel(amplitude, isPlaying);

  return (
    <div
      className="relative w-full max-w-lg aspect-[506/352] rounded-lg overflow-hidden border-2 border-jeopardy-gold/40 bg-jeopardy-navy-darker"
      aria-label="Jeopardy host"
    >
      {PANELS.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover ${
            i === active ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  );
}
