import type { Server as HTTPServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  rooms,
  type Room,
  type RoomGameState,
  type RoomScore,
  type LastAdjust,
  type ActiveClue,
} from './lib/rooms.js';
import { isValidPasscode, passcodeConfigured } from './lib/passcode.js';
import {
  loadActiveScores,
  pickRandomCategory,
  adjustPlayerScore,
  judgeAnswerServerSide,
} from './lib/game.js';
import { corsOrigin } from './lib/cors.js';

type JoinPayload = { code: string; isHost: boolean; passcode?: string };
type Ack = (resp: { ok: boolean; error?: string }) => void;

type RoomStatePayload = {
  code: string;
  members: Array<{
    socketId: string;
    name: string | null;
    isHost: boolean;
    playerId: number | null;
  }>;
  hostConnected: boolean;
  hostDisconnectedAt: number | null;
};

type GameStatePayload = {
  game: RoomGameState;
  scores: RoomScore[];
  lastAdjust: LastAdjust | null;
};

type ClientToServer = {
  'room:join': (payload: JoinPayload, ack: Ack) => void;
  'host:start_round': (
    payload: { type: 'single' | 'double' },
    ack: Ack,
  ) => void;
  'host:reveal_clue': (payload: { clueId: number }, ack: Ack) => void;
  'host:reveal_answer': (ack: Ack) => void;
  'host:close_clue': (ack: Ack) => void;
  'host:reset_round': (ack: Ack) => void;
  'host:adjust_score': (
    payload: { playerId: number; delta: number },
    ack: Ack,
  ) => void;
  'host:undo_score': (ack: Ack) => void;
  'host:rule_correct': (ack: Ack) => void;
  'host:rule_incorrect': (ack: Ack) => void;
  'host:cancel_buzz': (ack: Ack) => void;
  'player:identify': (payload: { playerId: number }, ack: Ack) => void;
  'player:buzz': (ack: Ack) => void;
  'player:typing': (payload: { text: string }, ack: Ack) => void;
  'player:submit': (payload: { text: string }, ack: Ack) => void;
};

type ServerToClient = {
  'room:state': (payload: RoomStatePayload) => void;
  'room:closed': () => void;
  'game:state': (payload: GameStatePayload) => void;
};

interface SocketData {
  joinedRoomCode: string | null;
  isHost: boolean;
}

type Io = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const RATIO = 1.5;
const HOST_GRACE_MS = 60_000;
const BUZZ_TIMEOUT_MS = 10_000;

export function attachSockets(httpServer: HTTPServer): Io {
  const io: Io = new Server(httpServer, {
    cors: { origin: corsOrigin(), credentials: true },
  });

  io.on('connection', (socket) => {
    socket.data.joinedRoomCode = null;
    socket.data.isHost = false;

    socket.on('room:join', async (payload, ack) => {
      const room = rooms.get(payload.code);
      if (!room) return ack({ ok: false, error: 'room not found' });

      if (payload.isHost) {
        if (!passcodeConfigured())
          return ack({ ok: false, error: 'APP_PASSCODE not configured on server' });
        if (!isValidPasscode(payload.passcode))
          return ack({ ok: false, error: 'invalid passcode' });
        if (room.hostSocketId && room.hostSocketId !== socket.id)
          return ack({ ok: false, error: 'room already has a host' });
        room.hostSocketId = socket.id;
        socket.data.isHost = true;
        // Cancel any pending grace-period deletion if host reconnected
        if (room.hostGraceTimer) {
          clearTimeout(room.hostGraceTimer);
          room.hostGraceTimer = null;
        }
        room.hostDisconnectedAt = null;
      }

      room.members.set(socket.id, {
        socketId: socket.id,
        playerId: null,
        name: null,
        isHost: payload.isHost,
      });
      socket.data.joinedRoomCode = room.code;
      socket.join(room.code);

      if (room.scores.length === 0) {
        try {
          room.scores = await loadActiveScores();
        } catch (err) {
          console.error('[room] failed to load scores', err);
        }
      }

      ack({ ok: true });
      broadcastRoomState(io, room.code);
      sendGameState(socket, room);
    });

    socket.on('player:identify', (payload, ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      if (!member) return ack({ ok: false, error: 'not a member' });
      const score = room.scores.find((s) => s.playerId === payload.playerId);
      if (!score) return ack({ ok: false, error: 'unknown player id' });
      member.playerId = payload.playerId;
      member.name = score.name;
      ack({ ok: true });
      broadcastRoomState(io, room.code);
    });

    socket.on('player:buzz', (ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      if (!member?.playerId)
        return ack({ ok: false, error: 'pick a player first' });
      const clue = room.game.activeClue;
      if (!clue || clue.revealed)
        return ack({ ok: false, error: 'no clue is open for buzzing' });
      if (clue.buzzedPlayerId !== null)
        return ack({ ok: false, error: 'someone already buzzed' });
      if (clue.lockedOutPlayerIds.includes(member.playerId))
        return ack({ ok: false, error: 'you are locked out for this clue' });
      if (clue.pendingJudgement)
        return ack({ ok: false, error: 'judgement in progress' });
      clue.buzzedPlayerId = member.playerId;
      clue.buzzedAt = Date.now();
      clue.typingAnswer = '';
      ack({ ok: true });
      broadcastGameState(io, room);

      // Schedule timeout — if the player doesn't submit in 10s, auto-handle
      const buzzedRoomCode = room.code;
      const buzzedClueId = clue.id;
      const buzzedPlayerId = member.playerId;
      setTimeout(() => {
        void handleBuzzTimeout(io, buzzedRoomCode, buzzedClueId, buzzedPlayerId);
      }, BUZZ_TIMEOUT_MS);
    });

    socket.on('player:typing', (payload, ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      const clue = room.game.activeClue;
      if (!clue || !member?.playerId) return ack({ ok: false, error: 'invalid' });
      if (clue.buzzedPlayerId !== member.playerId)
        return ack({ ok: false, error: 'not your turn' });
      clue.typingAnswer = payload.text.slice(0, 200);
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('player:submit', async (payload, ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      const clue = room.game.activeClue;
      if (!clue || !member?.playerId) return ack({ ok: false, error: 'invalid' });
      if (clue.buzzedPlayerId !== member.playerId)
        return ack({ ok: false, error: 'not your turn' });
      const text = payload.text.trim();
      if (!text) return ack({ ok: false, error: 'empty answer' });

      clue.pendingJudgement = {
        playerId: member.playerId,
        playerName: member.name ?? `Player ${member.playerId}`,
        answer: text,
        state: 'judging',
        reasoning: null,
      };
      clue.buzzedPlayerId = null;
      clue.typingAnswer = '';
      broadcastGameState(io, room);

      const outcome = await judgeAnswerServerSide(
        stripHtml(clue.question),
        clue.answer,
        text,
      );

      // Re-fetch the room and clue in case the host advanced past it while we were judging.
      const fresh = rooms.get(room.code);
      if (!fresh || fresh.game.activeClue?.id !== clue.id) {
        ack({ ok: true });
        return;
      }
      const freshClue = fresh.game.activeClue;
      if (!freshClue.pendingJudgement) {
        ack({ ok: true });
        return;
      }

      if (!outcome.ok) {
        freshClue.pendingJudgement = {
          ...freshClue.pendingJudgement,
          state: 'incorrect',
          reasoning: `Judge unavailable: ${outcome.error}. Host can manually rule.`,
        };
      } else {
        freshClue.pendingJudgement = {
          ...freshClue.pendingJudgement,
          state: outcome.correct ? 'correct' : 'incorrect',
          reasoning: outcome.reasoning,
        };
      }
      ack({ ok: true });
      broadcastGameState(io, fresh);
    });

    socket.on('host:start_round', async (payload, ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      if (payload.type !== 'single' && payload.type !== 'double')
        return ack({ ok: false, error: 'invalid round type' });
      const round = await pickRandomCategory(payload.type);
      if (!round) return ack({ ok: false, error: 'no category found' });
      room.game.round = round;
      room.game.usedClueIds = [];
      room.game.activeClue = null;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:reveal_clue', (payload, ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const clue = room.game.round?.clues.find((c) => c.id === payload.clueId);
      if (!clue) return ack({ ok: false, error: 'clue not found' });
      room.game.activeClue = newActiveClue(clue);
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:reveal_answer', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      if (!room.game.activeClue) return ack({ ok: false, error: 'no active clue' });
      room.game.activeClue.revealed = true;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:close_clue', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const active = room.game.activeClue;
      if (active) {
        if (!room.game.usedClueIds.includes(active.id)) {
          room.game.usedClueIds.push(active.id);
        }
        room.game.activeClue = null;
      }
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:reset_round', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      room.game.round = null;
      room.game.usedClueIds = [];
      room.game.activeClue = null;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:cancel_buzz', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const clue = room.game.activeClue;
      if (!clue) return ack({ ok: false, error: 'no active clue' });
      clue.buzzedPlayerId = null;
      clue.typingAnswer = '';
      clue.pendingJudgement = null;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:rule_correct', async (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const clue = room.game.activeClue;
      const pending = clue?.pendingJudgement;
      if (!clue || !pending) return ack({ ok: false, error: 'no pending judgement' });

      try {
        await adjustPlayerScore(pending.playerId, clue.value);
      } catch (err) {
        return ack({
          ok: false,
          error: err instanceof Error ? err.message : 'score update failed',
        });
      }
      const refreshed = await loadActiveScores();
      room.scores = refreshed;
      const player = refreshed.find((s) => s.playerId === pending.playerId);
      room.lastAdjust = {
        playerId: pending.playerId,
        playerName: player?.name ?? pending.playerName,
        delta: clue.value,
      };
      clue.revealed = true;
      clue.pendingJudgement = null;
      // Mark clue used and close it
      if (!room.game.usedClueIds.includes(clue.id)) {
        room.game.usedClueIds.push(clue.id);
      }
      room.game.activeClue = null;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:rule_incorrect', async (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const clue = room.game.activeClue;
      const pending = clue?.pendingJudgement;
      if (!clue || !pending) return ack({ ok: false, error: 'no pending judgement' });

      // Apply leader penalty if applicable
      const penalty = computeLeaderPenalty(room.scores);
      let penaltyApplied = 0;
      if (penalty.active && pending.playerId === penalty.leaderId) {
        try {
          await adjustPlayerScore(pending.playerId, -clue.value);
          penaltyApplied = clue.value;
        } catch (err) {
          console.error('[room] penalty adjust failed', err);
        }
        const refreshed = await loadActiveScores();
        room.scores = refreshed;
        room.lastAdjust = {
          playerId: pending.playerId,
          playerName: pending.playerName,
          delta: -clue.value,
        };
      }

      // Lockout the player and clear pending state
      if (!clue.lockedOutPlayerIds.includes(pending.playerId)) {
        clue.lockedOutPlayerIds.push(pending.playerId);
      }
      clue.pendingJudgement = null;
      ack({ ok: true });
      broadcastGameState(io, room);
      void penaltyApplied; // silence unused — useful for future logging
    });

    socket.on('host:adjust_score', async (payload, ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      if (typeof payload.playerId !== 'number' || typeof payload.delta !== 'number')
        return ack({ ok: false, error: 'invalid payload' });
      try {
        await adjustPlayerScore(payload.playerId, payload.delta);
      } catch (err) {
        return ack({
          ok: false,
          error: err instanceof Error ? err.message : 'score update failed',
        });
      }
      const refreshed = await loadActiveScores();
      room.scores = refreshed;
      const player = refreshed.find((s) => s.playerId === payload.playerId);
      room.lastAdjust = {
        playerId: payload.playerId,
        playerName: player?.name ?? `Player ${payload.playerId}`,
        delta: payload.delta,
      };
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:undo_score', async (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const last = room.lastAdjust;
      if (!last) return ack({ ok: false, error: 'nothing to undo' });
      try {
        await adjustPlayerScore(last.playerId, -last.delta);
      } catch (err) {
        return ack({
          ok: false,
          error: err instanceof Error ? err.message : 'undo failed',
        });
      }
      room.scores = await loadActiveScores();
      room.lastAdjust = null;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('disconnect', () => {
      const code = socket.data.joinedRoomCode;
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const member = room.members.get(socket.id);
      room.members.delete(socket.id);
      // If a player who currently has the floor disconnects, clear the buzz so others can try
      if (
        member?.playerId !== null &&
        member?.playerId !== undefined &&
        room.game.activeClue?.buzzedPlayerId === member.playerId
      ) {
        room.game.activeClue.buzzedPlayerId = null;
        room.game.activeClue.typingAnswer = '';
        broadcastGameState(io, room);
      }
      if (room.hostSocketId === socket.id) {
        // Start a grace period instead of closing immediately
        room.hostSocketId = null;
        room.hostDisconnectedAt = Date.now();
        room.hostGraceTimer = setTimeout(() => {
          const stillThere = rooms.get(room.code);
          if (!stillThere || stillThere.hostSocketId !== null) return;
          io.to(room.code).emit('room:closed');
          rooms.delete(room.code);
        }, HOST_GRACE_MS);
        broadcastRoomState(io, room.code);
        return;
      }
      broadcastRoomState(io, room.code);
    });
  });

  return io;
}

function newActiveClue(clue: { id: number; value: number; question: string; answer: string }): ActiveClue {
  return {
    id: clue.id,
    value: clue.value,
    question: clue.question,
    answer: clue.answer,
    revealed: false,
    buzzedPlayerId: null,
    buzzedAt: null,
    typingAnswer: '',
    lockedOutPlayerIds: [],
    pendingJudgement: null,
  };
}

async function handleBuzzTimeout(
  io: Io,
  roomCode: string,
  clueId: number,
  playerId: number,
): Promise<void> {
  const room = rooms.get(roomCode);
  if (!room) return;
  const clue = room.game.activeClue;
  if (!clue || clue.id !== clueId) return;
  if (clue.buzzedPlayerId !== playerId) return; // already resolved
  if (clue.pendingJudgement) return;

  const text = clue.typingAnswer.trim();
  if (text) {
    // Auto-submit whatever they typed — same path as a normal submission
    const playerName =
      room.scores.find((s) => s.playerId === playerId)?.name ?? `Player ${playerId}`;
    clue.pendingJudgement = {
      playerId,
      playerName,
      answer: text,
      state: 'judging',
      reasoning: null,
    };
    clue.buzzedPlayerId = null;
    clue.buzzedAt = null;
    clue.typingAnswer = '';
    broadcastGameState(io, room);

    const outcome = await judgeAnswerServerSide(
      stripHtml(clue.question),
      clue.answer,
      text,
    );

    const fresh = rooms.get(roomCode);
    if (!fresh || fresh.game.activeClue?.id !== clueId) return;
    const freshClue = fresh.game.activeClue;
    if (!freshClue.pendingJudgement) return;

    if (!outcome.ok) {
      freshClue.pendingJudgement = {
        ...freshClue.pendingJudgement,
        state: 'incorrect',
        reasoning: `Time ran out. Judge unavailable: ${outcome.error}.`,
      };
    } else {
      freshClue.pendingJudgement = {
        ...freshClue.pendingJudgement,
        state: outcome.correct ? 'correct' : 'incorrect',
        reasoning: `(Submitted on timeout) ${outcome.reasoning}`,
      };
    }
    broadcastGameState(io, fresh);
    return;
  }

  // Empty answer — lock the player out and clear the buzz
  if (!clue.lockedOutPlayerIds.includes(playerId)) {
    clue.lockedOutPlayerIds.push(playerId);
  }
  clue.buzzedPlayerId = null;
  clue.buzzedAt = null;
  clue.typingAnswer = '';
  broadcastGameState(io, room);
}

function requireHost(socket: AppSocket): Room | null {
  if (!socket.data.isHost) return null;
  const code = socket.data.joinedRoomCode;
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  if (room.hostSocketId !== socket.id) return null;
  return room;
}

function broadcastRoomState(io: Io, code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('room:state', {
    code: room.code,
    members: [...room.members.values()].map((m) => ({
      socketId: m.socketId,
      name: m.name,
      isHost: m.isHost,
      playerId: m.playerId,
    })),
    hostConnected: room.hostSocketId !== null,
    hostDisconnectedAt: room.hostDisconnectedAt,
  });
}

function broadcastGameState(io: Io, room: Room): void {
  io.to(room.code).emit('game:state', {
    game: room.game,
    scores: room.scores,
    lastAdjust: room.lastAdjust,
  });
}

function sendGameState(socket: AppSocket, room: Room): void {
  socket.emit('game:state', {
    game: room.game,
    scores: room.scores,
    lastAdjust: room.lastAdjust,
  });
}

function computeLeaderPenalty(scores: RoomScore[]): {
  active: boolean;
  leaderId: number | null;
} {
  if (scores.length < 2) return { active: false, leaderId: null };
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const active =
    leader.score > 0 && runnerUp.score > 0 && leader.score >= RATIO * runnerUp.score;
  return { active, leaderId: active ? leader.playerId : null };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
