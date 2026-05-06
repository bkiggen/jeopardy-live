import { useState } from 'react';

export type Round = 'single' | 'double' | 'final';

export type Clue = {
  id: number;
  category: string;
  value: number;
  question: string;
  answer: string;
};

export type GameState = {
  round: Round | null;
  category: string | null;
  clues: Clue[];
  currentIndex: number;
};

export function useGameState() {
  const [state, setState] = useState<GameState>({
    round: null,
    category: null,
    clues: [],
    currentIndex: 0,
  });

  return { state, setState };
}
