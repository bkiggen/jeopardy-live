import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

export type RoomMemberView = {
  socketId: string;
  name: string | null;
  isHost: boolean;
};

type ConnectionStatus = 'connecting' | 'connected' | 'closed' | 'error';

type RoomContextValue = {
  code: string;
  isHost: boolean;
  status: ConnectionStatus;
  errorMessage: string | null;
  members: RoomMemberView[];
  socket: Socket | null;
};

const RoomContext = createContext<RoomContextValue | null>(null);

type Props = {
  code: string;
  isHost: boolean;
  children: ReactNode;
};

export function RoomProvider({ code, isHost, children }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<RoomMemberView[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s: Socket = io(SOCKET_URL || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    setSocket(s);

    s.on('connect', () => {
      s.emit(
        'room:join',
        { code, isHost },
        (resp: { ok: boolean; error?: string }) => {
          if (resp.ok) {
            setStatus('connected');
            setErrorMessage(null);
          } else {
            setStatus('error');
            setErrorMessage(resp.error ?? 'failed to join room');
          }
        },
      );
    });

    s.on('disconnect', () => setStatus('connecting'));
    s.on('connect_error', (err: Error) => {
      setStatus('error');
      setErrorMessage(err.message);
    });
    s.on('room:state', (payload: { members: RoomMemberView[] }) => {
      setMembers(payload.members);
    });
    s.on('room:closed', () => {
      setStatus('closed');
      setErrorMessage('Host left and the room was closed.');
    });

    return () => {
      s.disconnect();
    };
  }, [code, isHost]);

  const value = useMemo<RoomContextValue>(
    () => ({ code, isHost, status, errorMessage, members, socket }),
    [code, isHost, status, errorMessage, members, socket],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside RoomProvider');
  return ctx;
}
