import type { Player } from '../api';

export type PenaltyState = {
  active: boolean;
  leaderId: number | null;
  leaderScore: number;
  runnerUpScore: number;
  threshold: number;
};

const RATIO = 1.5;

export function leaderPenalty(players: Player[]): PenaltyState {
  if (players.length < 2) {
    return { active: false, leaderId: null, leaderScore: 0, runnerUpScore: 0, threshold: 0 };
  }
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const active =
    leader.score > 0 && runnerUp.score > 0 && leader.score >= RATIO * runnerUp.score;
  return {
    active,
    leaderId: active ? leader.id : null,
    leaderScore: leader.score,
    runnerUpScore: runnerUp.score,
    threshold: Math.ceil(RATIO * runnerUp.score),
  };
}
