export type GameClue = {
  id: number;
  value: number;
  question: string;
  answer: string;
};

export type GameRound = {
  category: string;
  showNumber: number;
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
};

export type RoomGameState = {
  round: GameRound | null;
  usedClueIds: number[];
  activeClue: ActiveClue | null;
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
  hostSocketId: string | null;
  members: Map<string, RoomMember>;
  createdAt: number;
  game: RoomGameState;
  scores: RoomScore[];
  lastAdjust: LastAdjust | null;
  hostDisconnectedAt: number | null;
  hostGraceTimer: ReturnType<typeof setTimeout> | null;
};

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const ROOM_CODE_LENGTH = 4;

function generateCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

function emptyGame(): RoomGameState {
  return { round: null, usedClueIds: [], activeClue: null };
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(): Room {
    let code = generateCode();
    let attempts = 0;
    while (this.rooms.has(code) && attempts < 50) {
      code = generateCode();
      attempts += 1;
    }
    const room: Room = {
      code,
      hostSocketId: null,
      members: new Map(),
      createdAt: Date.now(),
      game: emptyGame(),
      scores: [],
      lastAdjust: null,
      hostDisconnectedAt: null,
      hostGraceTimer: null,
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
