import type { Server as HTTPServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { rooms } from './lib/rooms.js';

type ClientToServer = {
  'room:join': (
    payload: { code: string; isHost: boolean },
    ack: (resp: { ok: boolean; error?: string }) => void,
  ) => void;
};

type ServerToClient = {
  'room:state': (payload: {
    code: string;
    members: Array<{ socketId: string; name: string | null; isHost: boolean }>;
  }) => void;
  'room:closed': () => void;
};

export function attachSockets(httpServer: HTTPServer): Server {
  const io = new Server<ClientToServer, ServerToClient>(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.on('connection', (socket: Socket) => {
    let joinedRoomCode: string | null = null;

    socket.on(
      'room:join',
      (payload, ack) => {
        const room = rooms.get(payload.code);
        if (!room) {
          ack({ ok: false, error: 'room not found' });
          return;
        }
        if (payload.isHost && room.hostSocketId && room.hostSocketId !== socket.id) {
          ack({ ok: false, error: 'room already has a host' });
          return;
        }

        room.members.set(socket.id, {
          socketId: socket.id,
          playerId: null,
          name: null,
          isHost: payload.isHost,
        });
        if (payload.isHost) room.hostSocketId = socket.id;
        joinedRoomCode = room.code;
        socket.join(room.code);
        ack({ ok: true });
        broadcastRoomState(io, room.code);
      },
    );

    socket.on('disconnect', () => {
      if (!joinedRoomCode) return;
      const room = rooms.get(joinedRoomCode);
      if (!room) return;
      room.members.delete(socket.id);
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null;
        // Host left — close the room. Phase E will add a grace period.
        io.to(room.code).emit('room:closed');
        rooms.delete(room.code);
        return;
      }
      broadcastRoomState(io, room.code);
    });
  });

  return io;
}

function broadcastRoomState(io: Server, code: string): void {
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
