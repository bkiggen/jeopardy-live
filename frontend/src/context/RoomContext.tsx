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
  playerId: number | null;
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
  ruleCorrect: () => Promise<AckResponse>;
  ruleIncorrect: () => Promise<AckResponse>;
  cancelBuzz: () => Promise<AckResponse>;
  identifyPlayer: (playerId: number) => Promise<AckResponse>;
  buzz: () => Promise<AckResponse>;
  pass: () => Promise<AckResponse>;
  typing: (text: string) => Promise<AckResponse>;
  submit: (text: string) => Promise<AckResponse>;
  endGame: () => Promise<AckResponse>;
  startFinal: () => Promise<AckResponse>;
  finalWager: (wager: number) => Promise<AckResponse>;
  finalAnswer: (answer: string) => Promise<AckResponse>;
  forceFinalAnswer: () => Promise<AckResponse>;
  ruleFinal: (playerId: number, correct: boolean) => Promise<AckResponse>;
  applyFinal: () => Promise<AckResponse>;
};

type RoomContextValue = {
  code: string;
  isHost: boolean;
  teamId: number | null;
  teamName: string | null;
  status: ConnectionStatus;
  errorMessage: string | null;
  members: RoomMemberView[];
  game: RoomGameState;
  scores: RoomScore[];
  lastAdjust: RoomLastAdjust | null;
  actions: RoomActions;
  socketId: string | null;
  hostConnected: boolean;
  hostDisconnectedAt: number | null;
  gameEnded: boolean;
};

const emptyGame: RoomGameState = {
  round: null,
  usedClueIds: [],
  activeClue: null,
  final: null,
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
  const [socketId, setSocketId] = useState<string | null>(null);
  const [hostConnected, setHostConnected] = useState<boolean>(true);
  const [hostDisconnectedAt, setHostDisconnectedAt] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s: Socket = io(SOCKET_URL || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = s;

    s.on('connect', () => {
      setSocketId(s.id ?? null);
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
    s.on(
      'room:state',
      (payload: {
        teamId: number;
        teamName: string;
        members: RoomMemberView[];
        hostConnected: boolean;
        hostDisconnectedAt: number | null;
      }) => {
        setMembers(payload.members);
        setHostConnected(payload.hostConnected);
        setHostDisconnectedAt(payload.hostDisconnectedAt);
        setTeamId(payload.teamId);
        setTeamName(payload.teamName);
      },
    );
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
    s.on('room:ended', () => {
      setGameEnded(true);
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
      ruleCorrect: () => emit('host:rule_correct'),
      ruleIncorrect: () => emit('host:rule_incorrect'),
      cancelBuzz: () => emit('host:cancel_buzz'),
      identifyPlayer: (playerId) => emit('player:identify', { playerId }),
      buzz: () => emit('player:buzz'),
      pass: () => emit('player:pass'),
      typing: (text) => emit('player:typing', { text }),
      submit: (text) => emit('player:submit', { text }),
      endGame: () => emit('host:end_game'),
      startFinal: () => emit('host:start_final'),
      finalWager: (wager) => emit('player:final_wager', { wager }),
      finalAnswer: (answer) => emit('player:final_answer', { answer }),
      forceFinalAnswer: () => emit('host:force_final_answer'),
      ruleFinal: (playerId, correct) =>
        emit('host:rule_final', { playerId, correct }),
      applyFinal: () => emit('host:apply_final'),
    };
  }, []);

  const value = useMemo<RoomContextValue>(
    () => ({
      code,
      isHost,
      teamId,
      teamName,
      status,
      errorMessage,
      members,
      game,
      scores,
      lastAdjust,
      actions,
      socketId,
      hostConnected,
      hostDisconnectedAt,
      gameEnded,
    }),
    [
      code,
      isHost,
      teamId,
      teamName,
      status,
      errorMessage,
      members,
      game,
      scores,
      lastAdjust,
      actions,
      socketId,
      hostConnected,
      hostDisconnectedAt,
      gameEnded,
    ],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside RoomProvider');
  return ctx;
}
