import type { Server as HTTPServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { rooms, type Room, type RoomGameState, type RoomScore, type LastAdjust } from './lib/rooms.js';
import { isValidPasscode, passcodeConfigured } from './lib/passcode.js';
import { loadActiveScores, pickRandomCategory, adjustPlayerScore } from './lib/game.js';

type JoinPayload = { code: string; isHost: boolean; passcode?: string };
type Ack = (resp: { ok: boolean; error?: string }) => void;

type RoomStatePayload = {
  code: string;
  members: Array<{ socketId: string; name: string | null; isHost: boolean }>;
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

export function attachSockets(httpServer: HTTPServer): Io {
  const io: Io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.on('connection', (socket) => {
    socket.data.joinedRoomCode = null;
    socket.data.isHost = false;

    socket.on('room:join', async (payload, ack) => {
      const room = rooms.get(payload.code);
      if (!room) {
        ack({ ok: false, error: 'room not found' });
        return;
      }

      if (payload.isHost) {
        if (!passcodeConfigured()) {
          ack({ ok: false, error: 'APP_PASSCODE not configured on server' });
          return;
        }
        if (!isValidPasscode(payload.passcode)) {
          ack({ ok: false, error: 'invalid passcode' });
          return;
        }
        if (room.hostSocketId && room.hostSocketId !== socket.id) {
          ack({ ok: false, error: 'room already has a host' });
          return;
        }
        room.hostSocketId = socket.id;
        socket.data.isHost = true;
      }

      room.members.set(socket.id, {
        socketId: socket.id,
        playerId: null,
        name: null,
        isHost: payload.isHost,
      });
      socket.data.joinedRoomCode = room.code;
      socket.join(room.code);

      // Lazy-load scores on first member if scores haven't been populated.
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

    socket.on('host:start_round', async (payload, ack) => {
      const room = requireHost(socket);
      if (!room) {
        ack({ ok: false, error: 'not authorized' });
        return;
      }
      if (payload.type !== 'single' && payload.type !== 'double') {
        ack({ ok: false, error: 'invalid round type' });
        return;
      }
      const round = await pickRandomCategory(payload.type);
      if (!round) {
        ack({ ok: false, error: 'no category found' });
        return;
      }
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
      room.game.activeClue = {
        id: clue.id,
        value: clue.value,
        question: clue.question,
        answer: clue.answer,
        revealed: false,
      };
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

    socket.on('host:adjust_score', async (payload, ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      if (
        typeof payload.playerId !== 'number' ||
        typeof payload.delta !== 'number'
      ) {
        return ack({ ok: false, error: 'invalid payload' });
      }
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
      room.members.delete(socket.id);
      if (room.hostSocketId === socket.id) {
        io.to(room.code).emit('room:closed');
        rooms.delete(room.code);
        return;
      }
      broadcastRoomState(io, room.code);
    });
  });

  return io;
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
    })),
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
