import type { Server as HTTPServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  rooms,
  type Room,
  type RoomGameState,
  type RoomScore,
  type LastAdjust,
  type ActiveClue,
  type FinalState,
  type FinalEntry,
  type RoomMember,
} from './lib/rooms.js';
import { isValidPasscode, passcodeConfigured } from './lib/passcode.js';
import {
  loadActiveScores,
  pickRandomCategory,
  pickRandomFinal,
  adjustPlayerScore,
  judgeAnswerServerSide,
} from './lib/game.js';
import { corsOrigin } from './lib/cors.js';
import { findTeamByCode } from './lib/teams.js';

type JoinPayload = { code: string; isHost: boolean; passcode?: string };
type Ack = (resp: { ok: boolean; error?: string }) => void;

type RoomStatePayload = {
  code: string;
  teamId: number;
  teamName: string;
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
  'host:end_game': (ack: Ack) => void;
  'host:start_final': (ack: Ack) => void;
  'host:force_final_answer': (ack: Ack) => void;
  'host:rule_final': (
    payload: { playerId: number; correct: boolean },
    ack: Ack,
  ) => void;
  'host:apply_final': (ack: Ack) => void;
  'player:identify': (payload: { playerId: number }, ack: Ack) => void;
  'player:buzz': (ack: Ack) => void;
  'player:pass': (ack: Ack) => void;
  'player:typing': (payload: { text: string }, ack: Ack) => void;
  'player:submit': (payload: { text: string }, ack: Ack) => void;
  'player:final_wager': (payload: { wager: number }, ack: Ack) => void;
  'player:final_answer': (payload: { answer: string }, ack: Ack) => void;
};

type ServerToClient = {
  'room:state': (payload: RoomStatePayload) => void;
  'room:closed': () => void;
  'room:ended': () => void;
  'game:state': (payload: GameStatePayload) => void;
  'lobby:host_changed': (payload: { code: string; hasHost: boolean }) => void;
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
const FINAL_ANSWER_MS = 30_000;

export function attachSockets(httpServer: HTTPServer): Io {
  const io: Io = new Server(httpServer, {
    cors: { origin: corsOrigin(), credentials: true },
  });

  io.on('connection', (socket) => {
    socket.data.joinedRoomCode = null;
    socket.data.isHost = false;

    socket.on('room:join', async (payload, ack) => {
      // Look up the persistent team by code; create the in-memory live room
      // on demand if no one's connected yet.
      const team = await findTeamByCode(payload.code);
      if (!team || !team.isActive) {
        return ack({ ok: false, error: 'team not found' });
      }
      const room = rooms.getOrCreate(team);

      if (payload.isHost) {
        if (!passcodeConfigured())
          return ack({ ok: false, error: 'APP_PASSCODE not configured on server' });
        if (!isValidPasscode(payload.passcode))
          return ack({ ok: false, error: 'invalid passcode' });
        if (room.hostSocketId && room.hostSocketId !== socket.id)
          return ack({ ok: false, error: 'room already has a host' });
        const wasUnclaimed = room.hostSocketId === null;
        room.hostSocketId = socket.id;
        socket.data.isHost = true;
        if (room.hostGraceTimer) {
          clearTimeout(room.hostGraceTimer);
          room.hostGraceTimer = null;
        }
        room.hostDisconnectedAt = null;
        if (wasUnclaimed) {
          io.emit('lobby:host_changed', { code: room.code, hasHost: true });
        }
      }

      room.members.set(socket.id, {
        socketId: socket.id,
        playerId: null,
        name: null,
        isHost: payload.isHost,
      });
      socket.data.joinedRoomCode = room.code;
      socket.join(room.code);

      // Always refresh scores on join — admin may have added players since
      // the room came into existence.
      try {
        room.scores = await loadActiveScores(room.teamId);
      } catch (err) {
        console.error('[room] failed to load scores', err);
      }

      ack({ ok: true });
      broadcastRoomState(io, room.code);
      sendGameState(socket, room);
    });

    socket.on('player:identify', async (payload, ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      if (!member) return ack({ ok: false, error: 'not a member' });
      // Refresh scores in case a self-service create just happened
      try {
        room.scores = await loadActiveScores(room.teamId);
      } catch (err) {
        console.error('[room] failed to refresh scores', err);
      }
      const score = room.scores.find((s) => s.playerId === payload.playerId);
      if (!score) return ack({ ok: false, error: 'unknown player id' });
      member.playerId = payload.playerId;
      member.name = score.name;
      ack({ ok: true });
      broadcastRoomState(io, room.code);
      // Push refreshed scores to anyone listening
      io.to(room.code).emit('game:state', {
        game: room.game,
        scores: room.scores,
        lastAdjust: room.lastAdjust,
      });
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

      const buzzedRoomCode = room.code;
      const buzzedClueId = clue.id;
      const buzzedPlayerId = member.playerId;
      setTimeout(() => {
        void handleBuzzTimeout(io, buzzedRoomCode, buzzedClueId, buzzedPlayerId);
      }, BUZZ_TIMEOUT_MS);
    });

    socket.on('player:pass', (ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      if (!member?.playerId)
        return ack({ ok: false, error: 'pick a player first' });
      const clue = room.game.activeClue;
      if (!clue || clue.revealed)
        return ack({ ok: false, error: 'no clue is open' });
      if (clue.buzzedPlayerId === member.playerId)
        return ack({ ok: false, error: 'you already buzzed — submit or wait it out' });
      if (clue.lockedOutPlayerIds.includes(member.playerId)) {
        return ack({ ok: true });
      }
      clue.lockedOutPlayerIds.push(member.playerId);
      ack({ ok: true });
      broadcastGameState(io, room);
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
      clue.buzzedAt = null;
      clue.typingAnswer = '';
      broadcastGameState(io, room);

      const outcome = await judgeAnswerServerSide(
        stripHtml(clue.question),
        clue.answer,
        text,
      );

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

    socket.on('host:end_game', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      ack({ ok: true });
      io.to(room.code).emit('room:ended');
      room.game.round = null;
      room.game.usedClueIds = [];
      room.game.activeClue = null;
      room.game.final = null;
      if (room.finalAnswerTimer) {
        clearTimeout(room.finalAnswerTimer);
        room.finalAnswerTimer = null;
      }
      broadcastGameState(io, room);
    });

    socket.on('host:start_final', async (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      if (room.game.final) return ack({ ok: false, error: 'final already started' });

      const clue = await pickRandomFinal();
      if (!clue) return ack({ ok: false, error: 'no final clues available' });

      // Eligibility: only players with score > 0 participate, per traditional rules.
      const starting: Record<number, { name: string; score: number }> = {};
      const entries: Record<number, FinalEntry> = {};
      for (const s of room.scores) {
        if (s.score <= 0) continue;
        starting[s.playerId] = { name: s.name, score: s.score };
        entries[s.playerId] = {
          wagered: false,
          answered: false,
          wager: null,
          answer: null,
          correct: null,
          reasoning: null,
        };
      }

      // Wipe the regular round state so the UI snaps to Final cleanly.
      room.game.round = null;
      room.game.usedClueIds = [];
      room.game.activeClue = null;
      room.game.final = {
        clueId: clue.id,
        category: clue.category,
        question: clue.question,
        answer: clue.answer,
        airDate: clue.airDate,
        phase: 'wagering',
        starting,
        entries,
        answerDeadline: null,
      };
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('player:final_wager', (payload, ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      if (!member?.playerId) return ack({ ok: false, error: 'pick a player first' });
      const final = room.game.final;
      if (!final || final.phase !== 'wagering')
        return ack({ ok: false, error: 'not accepting wagers' });
      const start = final.starting[member.playerId];
      if (!start) return ack({ ok: false, error: 'not eligible — score must be positive' });

      const wager = Math.floor(Number(payload.wager));
      if (!Number.isFinite(wager) || wager < 0)
        return ack({ ok: false, error: 'wager must be ≥ 0' });
      if (wager > start.score)
        return ack({ ok: false, error: `wager cannot exceed your score ($${start.score})` });

      const entry = final.entries[member.playerId];
      entry.wager = wager;
      entry.wagered = true;
      ack({ ok: true });

      // Auto-advance to answering phase when every eligible player has wagered.
      const eligibleIds = Object.keys(final.starting).map(Number);
      const allWagered = eligibleIds.every((id) => final.entries[id].wagered);
      if (allWagered) startAnswerPhase(io, room);
      else broadcastGameState(io, room);
    });

    socket.on('host:force_final_answer', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const final = room.game.final;
      if (!final || final.phase !== 'wagering')
        return ack({ ok: false, error: 'not in wagering phase' });
      // Players who didn't wager get a $0 default so they can still answer.
      for (const idStr of Object.keys(final.starting)) {
        const id = Number(idStr);
        if (!final.entries[id].wagered) {
          final.entries[id].wager = 0;
          final.entries[id].wagered = true;
        }
      }
      ack({ ok: true });
      startAnswerPhase(io, room);
    });

    socket.on('player:final_answer', (payload, ack) => {
      const room = rooms.get(socket.data.joinedRoomCode ?? '');
      if (!room) return ack({ ok: false, error: 'not in a room' });
      const member = room.members.get(socket.id);
      if (!member?.playerId) return ack({ ok: false, error: 'pick a player first' });
      const final = room.game.final;
      if (!final || final.phase !== 'answering')
        return ack({ ok: false, error: 'not accepting answers' });
      if (!final.starting[member.playerId])
        return ack({ ok: false, error: 'not eligible' });

      const text = String(payload.answer ?? '').trim().slice(0, 500);
      const entry = final.entries[member.playerId];
      entry.answer = text;
      entry.answered = true;
      ack({ ok: true });

      const eligibleIds = Object.keys(final.starting).map(Number);
      const allAnswered = eligibleIds.every((id) => final.entries[id].answered);
      if (allAnswered) {
        if (room.finalAnswerTimer) {
          clearTimeout(room.finalAnswerTimer);
          room.finalAnswerTimer = null;
        }
        void revealFinal(io, room);
      } else {
        broadcastGameState(io, room);
      }
    });

    socket.on('host:rule_final', (payload, ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const final = room.game.final;
      if (!final || final.phase !== 'revealed')
        return ack({ ok: false, error: 'not in reveal phase' });
      const entry = final.entries[payload.playerId];
      if (!entry) return ack({ ok: false, error: 'player not in final' });
      entry.correct = Boolean(payload.correct);
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:apply_final', async (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const final = room.game.final;
      if (!final || final.phase !== 'revealed')
        return ack({ ok: false, error: 'not in reveal phase' });

      // Apply each eligible player's wager based on the (possibly host-overridden) ruling.
      for (const idStr of Object.keys(final.starting)) {
        const playerId = Number(idStr);
        const entry = final.entries[playerId];
        if (entry.wager == null) continue;
        const delta = entry.correct ? entry.wager : -entry.wager;
        if (delta !== 0) {
          await adjustPlayerScore(playerId, room.teamId, delta).catch((err) =>
            console.error('[final] adjust failed', err),
          );
        }
      }
      try {
        room.scores = await loadActiveScores(room.teamId);
      } catch (err) {
        console.error('[final] reload scores failed', err);
      }
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:cancel_buzz', (ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      const clue = room.game.activeClue;
      if (!clue) return ack({ ok: false, error: 'no active clue' });
      clue.buzzedPlayerId = null;
      clue.buzzedAt = null;
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
        await adjustPlayerScore(pending.playerId, room.teamId, clue.value);
      } catch (err) {
        return ack({
          ok: false,
          error: err instanceof Error ? err.message : 'score update failed',
        });
      }
      const refreshed = await loadActiveScores(room.teamId);
      room.scores = refreshed;
      const player = refreshed.find((s) => s.playerId === pending.playerId);
      room.lastAdjust = {
        playerId: pending.playerId,
        playerName: player?.name ?? pending.playerName,
        delta: clue.value,
      };
      clue.revealed = true;
      clue.pendingJudgement = null;
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

      const penalty = computeLeaderPenalty(room.scores);
      if (penalty.active && pending.playerId === penalty.leaderId) {
        try {
          await adjustPlayerScore(pending.playerId, room.teamId, -clue.value);
        } catch (err) {
          console.error('[room] penalty adjust failed', err);
        }
        const refreshed = await loadActiveScores(room.teamId);
        room.scores = refreshed;
        room.lastAdjust = {
          playerId: pending.playerId,
          playerName: pending.playerName,
          delta: -clue.value,
        };
      }

      if (!clue.lockedOutPlayerIds.includes(pending.playerId)) {
        clue.lockedOutPlayerIds.push(pending.playerId);
      }
      clue.pendingJudgement = null;
      ack({ ok: true });
      broadcastGameState(io, room);
    });

    socket.on('host:adjust_score', async (payload, ack) => {
      const room = requireHost(socket);
      if (!room) return ack({ ok: false, error: 'not authorized' });
      if (typeof payload.playerId !== 'number' || typeof payload.delta !== 'number')
        return ack({ ok: false, error: 'invalid payload' });
      try {
        await adjustPlayerScore(payload.playerId, room.teamId, payload.delta);
      } catch (err) {
        return ack({
          ok: false,
          error: err instanceof Error ? err.message : 'score update failed',
        });
      }
      const refreshed = await loadActiveScores(room.teamId);
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
        await adjustPlayerScore(last.playerId, room.teamId, -last.delta);
      } catch (err) {
        return ack({
          ok: false,
          error: err instanceof Error ? err.message : 'undo failed',
        });
      }
      room.scores = await loadActiveScores(room.teamId);
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
      if (
        member?.playerId !== null &&
        member?.playerId !== undefined &&
        room.game.activeClue?.buzzedPlayerId === member.playerId
      ) {
        room.game.activeClue.buzzedPlayerId = null;
        room.game.activeClue.buzzedAt = null;
        room.game.activeClue.typingAnswer = '';
        broadcastGameState(io, room);
      }
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null;
        room.hostDisconnectedAt = Date.now();
        io.emit('lobby:host_changed', { code: room.code, hasHost: false });
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
  if (clue.buzzedPlayerId !== playerId) return;
  if (clue.pendingJudgement) return;

  const text = clue.typingAnswer.trim();
  if (text) {
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
    teamId: room.teamId,
    teamName: room.teamName,
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
  // When a final round is in flight, redact the payload per recipient so
  // private wagers/answers stay private until reveal time.
  if (room.game.final) {
    for (const member of room.members.values()) {
      const target = io.sockets.sockets.get(member.socketId);
      if (!target) continue;
      target.emit('game:state', {
        game: { ...room.game, final: viewFinal(room.game.final, member) },
        scores: room.scores,
        lastAdjust: room.lastAdjust,
      });
    }
    return;
  }
  io.to(room.code).emit('game:state', {
    game: room.game,
    scores: room.scores,
    lastAdjust: room.lastAdjust,
  });
}

function viewFinal(final: FinalState, member: RoomMember): FinalState {
  const reveal = final.phase === 'revealed';
  const isHost = member.isHost;
  const myId = member.playerId;
  const showQuestion = isHost || final.phase !== 'wagering';
  const showAnswer = isHost || reveal;

  const entries: Record<number, FinalEntry> = {};
  for (const [pidStr, e] of Object.entries(final.entries)) {
    const pid = Number(pidStr);
    const showFull = reveal || isHost || pid === myId;
    entries[pid] = {
      wagered: e.wagered,
      answered: e.answered,
      wager: showFull ? e.wager : null,
      answer: showFull ? e.answer : null,
      correct: reveal ? e.correct : null,
      reasoning: reveal ? e.reasoning : null,
    };
  }

  return {
    ...final,
    question: showQuestion ? final.question : '',
    answer: showAnswer ? final.answer : '',
    entries,
  };
}

function sendGameState(socket: AppSocket, room: Room): void {
  if (room.game.final) {
    const member = room.members.get(socket.id);
    if (member) {
      socket.emit('game:state', {
        game: { ...room.game, final: viewFinal(room.game.final, member) },
        scores: room.scores,
        lastAdjust: room.lastAdjust,
      });
      return;
    }
  }
  socket.emit('game:state', {
    game: room.game,
    scores: room.scores,
    lastAdjust: room.lastAdjust,
  });
}

function startAnswerPhase(io: Io, room: Room): void {
  const final = room.game.final;
  if (!final) return;
  final.phase = 'answering';
  final.answerDeadline = Date.now() + FINAL_ANSWER_MS;
  if (room.finalAnswerTimer) clearTimeout(room.finalAnswerTimer);
  room.finalAnswerTimer = setTimeout(() => {
    const stillThere = rooms.get(room.code);
    if (!stillThere || stillThere !== room) return;
    if (room.game.final?.phase !== 'answering') return;
    void revealFinal(io, room);
  }, FINAL_ANSWER_MS);
  broadcastGameState(io, room);
}

async function revealFinal(io: Io, room: Room): Promise<void> {
  const final = room.game.final;
  if (!final) return;
  if (room.finalAnswerTimer) {
    clearTimeout(room.finalAnswerTimer);
    room.finalAnswerTimer = null;
  }
  final.phase = 'revealed';
  final.answerDeadline = null;

  // Judge each eligible player's answer in parallel. Empty answers are
  // automatically marked incorrect without burning a Claude call.
  const eligibleIds = Object.keys(final.starting).map(Number);
  await Promise.all(
    eligibleIds.map(async (id) => {
      const entry = final.entries[id];
      const text = (entry.answer ?? '').trim();
      if (!text) {
        entry.correct = false;
        entry.reasoning = 'No answer submitted.';
        return;
      }
      const result = await judgeAnswerServerSide(final.question, final.answer, text);
      if (result.ok) {
        entry.correct = result.correct;
        entry.reasoning = result.reasoning;
      } else {
        // If judge fails, default to incorrect with a note — host can override.
        entry.correct = false;
        entry.reasoning = `Judge unavailable: ${result.error}`;
      }
    }),
  );
  broadcastGameState(io, room);
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
