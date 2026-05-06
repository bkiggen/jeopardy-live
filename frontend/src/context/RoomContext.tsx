import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  getPasscode,
  type RoomGameState,
  type RoomScore,
  type RoomLastAdjust,
} from '../api';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

export type RoomMemberView = {
  socketId: string;
  name: string | null;
  isHost: boolean;
};

type ConnectionStatus = 'connecting' | 'connected' | 'closed' | 'error';

type AckResponse = { ok: boolean; error?: string };

type RoomActions = {
  startRound: (type: 'single' | 'double') => Promise<AckResponse>;
  revealClue: (clueId: number) => Promise<AckResponse>;
  revealAnswer: () => Promise<AckResponse>;
  closeClue: () => Promise<AckResponse>;
  resetRound: () => Promise<AckResponse>;
  adjustScore: (playerId: number, delta: number) => Promise<AckResponse>;
  undoScore: () => Promise<AckResponse>;
};

type RoomContextValue = {
  code: string;
  isHost: boolean;
  status: ConnectionStatus;
  errorMessage: string | null;
  members: RoomMemberView[];
  game: RoomGameState;
  scores: RoomScore[];
  lastAdjust: RoomLastAdjust | null;
  actions: RoomActions;
};

const emptyGame: RoomGameState = {
  round: null,
  usedClueIds: [],
  activeClue: null,
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
  const [game, setGame] = useState<RoomGameState>(emptyGame);
  const [scores, setScores] = useState<RoomScore[]>([]);
  const [lastAdjust, setLastAdjust] = useState<RoomLastAdjust | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s: Socket = io(SOCKET_URL || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = s;

    s.on('connect', () => {
      const passcode = isHost ? getPasscode() ?? undefined : undefined;
      s.emit('room:join', { code, isHost, passcode }, (resp: AckResponse) => {
        if (resp.ok) {
          setStatus('connected');
          setErrorMessage(null);
        } else {
          setStatus('error');
          setErrorMessage(resp.error ?? 'failed to join room');
        }
      });
    });

    s.on('disconnect', () => setStatus('connecting'));
    s.on('connect_error', (err: Error) => {
      setStatus('error');
      setErrorMessage(err.message);
    });
    s.on('room:state', (payload: { members: RoomMemberView[] }) => {
      setMembers(payload.members);
    });
    s.on(
      'game:state',
      (payload: {
        game: RoomGameState;
        scores: RoomScore[];
        lastAdjust: RoomLastAdjust | null;
      }) => {
        setGame(payload.game);
        setScores(payload.scores);
        setLastAdjust(payload.lastAdjust);
      },
    );
    s.on('room:closed', () => {
      setStatus('closed');
      setErrorMessage('Host left and the room was closed.');
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [code, isHost]);

  const actions: RoomActions = useMemo(() => {
    function emit(event: string, payload?: unknown): Promise<AckResponse> {
      return new Promise((resolve) => {
        const s = socketRef.current;
        if (!s) {
          resolve({ ok: false, error: 'not connected' });
          return;
        }
        if (payload === undefined) {
          s.emit(event, (resp: AckResponse) => resolve(resp));
        } else {
          s.emit(event, payload, (resp: AckResponse) => resolve(resp));
        }
      });
    }
    return {
      startRound: (type) => emit('host:start_round', { type }),
      revealClue: (clueId) => emit('host:reveal_clue', { clueId }),
      revealAnswer: () => emit('host:reveal_answer'),
      closeClue: () => emit('host:close_clue'),
      resetRound: () => emit('host:reset_round'),
      adjustScore: (playerId, delta) =>
        emit('host:adjust_score', { playerId, delta }),
      undoScore: () => emit('host:undo_score'),
    };
  }, []);

  const value = useMemo<RoomContextValue>(
    () => ({
      code,
      isHost,
      status,
      errorMessage,
      members,
      game,
      scores,
      lastAdjust,
      actions,
    }),
    [code, isHost, status, errorMessage, members, game, scores, lastAdjust, actions],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside RoomProvider');
  return ctx;
}
