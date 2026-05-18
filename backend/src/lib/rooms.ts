export type GameClue = {
  id: number;
  value: number;
  question: string;
  answer: string;
};

export type GameRound = {
  category: string;
  showNumber: number;
  airDate: string | null;
  type: 'single' | 'double';
  clues: GameClue[];
};

export type PendingJudgement = {
  playerId: number;
  playerName: string;
  answer: string;
  state: 'judging' | 'correct' | 'incorrect';
  reasoning: string | null;
};

export type ActiveClue = {
  id: number;
  value: number;
  question: string;
  answer: string;
  revealed: boolean;
  // Buzzes are rejected before this timestamp — gives players a fair window
  // to read the clue before the fastest buzzer-finger can lock everyone else
  // out. ms epoch.
  buzzableAt: number;
  buzzedPlayerId: number | null;
  buzzedAt: number | null;
  typingAnswer: string;
  lockedOutPlayerIds: number[];
  pendingJudgement: PendingJudgement | null;
};

export type RoomScore = {
  playerId: number;
  name: string;
  score: number;
  prefersAllCaps: boolean;
};

export type FinalPhase = 'wagering' | 'answering' | 'revealed';

export type FinalEntry = {
  wagered: boolean;          // visible to everyone — UI shows checkmark
  answered: boolean;         // visible to everyone — UI shows checkmark
  wager: number | null;      // visible to self/host always; everyone on revealed
  answer: string | null;     // visible to self/host always; everyone on revealed
  correct: boolean | null;   // judged or host-overridden; visible on revealed
  reasoning: string | null;
};

export type FinalState = {
  clueId: number;
  category: string;
  question: string;     // hidden from clients during wagering
  answer: string;       // hidden from clients except host until revealed
  airDate: string | null;
  phase: FinalPhase;
  // Snapshot of eligible players' starting scores, taken at start_final time.
  // Used to bound wagers and to apply +/- after rulings.
  starting: Record<number, { name: string; score: number }>;
  entries: Record<number, FinalEntry>;
  answerDeadline: number | null;  // ms epoch when answer phase ends
};

export type RoomGameState = {
  round: GameRound | null;
  usedClueIds: number[];
  activeClue: ActiveClue | null;
  final: FinalState | null;
};

export type LastAdjust = {
  playerId: number;
  playerName: string;
  delta: number;
};

export type RoomMember = {
  socketId: string;
  playerId: number | null;
  name: string | null;
  isHost: boolean;
};

export type Room = {
  code: string;
  teamId: number;
  teamName: string;
  hostSocketId: string | null;
  members: Map<string, RoomMember>;
  createdAt: number;
  game: RoomGameState;
  scores: RoomScore[];
  lastAdjust: LastAdjust | null;
  hostDisconnectedAt: number | null;
  hostGraceTimer: ReturnType<typeof setTimeout> | null;
  finalAnswerTimer: ReturnType<typeof setTimeout> | null;
};

function emptyGame(): RoomGameState {
  return { round: null, usedClueIds: [], activeClue: null, final: null };
}

// In-memory live-session state keyed by team code. Persistent team data
// (name, players, scores) lives in the DB; this just holds the ephemeral
// stuff for an active session (current round, active clue, buzzes).
export class RoomManager {
  private rooms = new Map<string, Room>();

  getOrCreate(team: { id: number; name: string; code: string }): Room {
    const code = team.code.toUpperCase();
    const existing = this.rooms.get(code);
    if (existing) return existing;
    const room: Room = {
      code,
      teamId: team.id,
      teamName: team.name,
      hostSocketId: null,
      members: new Map(),
      createdAt: Date.now(),
      game: emptyGame(),
      scores: [],
      lastAdjust: null,
      hostDisconnectedAt: null,
      hostGraceTimer: null,
      finalAnswerTimer: null,
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  reset(): void {
    this.rooms.clear();
  }
}

export const rooms = new RoomManager();
