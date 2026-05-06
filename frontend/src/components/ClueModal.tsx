import { useMemo, useState } from 'react';
import { judgeAnswer, type Clue, type Player } from '../api';
import { useHostContext } from '../context/HostContext';
import { leaderPenalty } from '../lib/penalty';

type Props = {
  clue: Clue;
  players: Player[];
  award: (playerId: number, delta: number) => Promise<void>;
  onClose: () => void;
};

type Phase =
  | { kind: 'pick' }
  | { kind: 'judging'; playerId: number; playerAnswer: string }
  | {
      kind: 'correct';
      playerId: number;
      playerAnswer: string;
      reasoning: string;
    }
  | { kind: 'incorrect'; playerId: number; reasoning: string }
  | { kind: 'judge_unavailable'; message: string };

export function ClueModal({ clue, players, award, onClose }: Props) {
  const { speak } = useHostContext();
  const [revealed, setRevealed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [lockedOut, setLockedOut] = useState<Set<number>>(new Set());

  const penalty = useMemo(() => leaderPenalty(players), [players]);
  const remaining = players.filter((p) => !lockedOut.has(p.id));

  async function submit() {
    if (selectedPlayerId == null || !answerText.trim()) return;
    const playerAnswer = answerText.trim();
    setPhase({ kind: 'judging', playerId: selectedPlayerId, playerAnswer });

    const outcome = await judgeAnswer({
      question: stripHtmlForDisplay(clue.question),
      correctAnswer: clue.answer,
      playerAnswer,
    });

    if (outcome.kind === 'unavailable') {
      setPhase({ kind: 'judge_unavailable', message: outcome.message });
      return;
    }
    if (outcome.kind === 'correct') {
      setRevealed(true);
      setPhase({
        kind: 'correct',
        playerId: selectedPlayerId,
        playerAnswer,
        reasoning: outcome.reasoning,
      });
    } else {
      const wrongPlayerId = selectedPlayerId;
      const isPenaltyTarget = penalty.active && wrongPlayerId === penalty.leaderId;
      if (isPenaltyTarget) {
        await award(wrongPlayerId, -clue.value);
      }
      setLockedOut((prev) => new Set(prev).add(wrongPlayerId));
      setPhase({ kind: 'incorrect', playerId: wrongPlayerId, reasoning: outcome.reasoning });
    }
  }

  async function approve() {
    if (phase.kind !== 'correct') return;
    await award(phase.playerId, clue.value);
    onClose();
  }

  function rejectCorrectRuling() {
    if (phase.kind !== 'correct') return;
    setLockedOut((prev) => new Set(prev).add(phase.playerId));
    resetForNextAttempt();
  }

  function resetForNextAttempt() {
    setSelectedPlayerId(null);
    setAnswerText('');
    setPhase({ kind: 'pick' });
  }

  async function manualAward(playerId: number, delta: number) {
    await award(playerId, delta);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 cursor-pointer"
      onClick={onClose}
      role="button"
      tabIndex={-1}
      aria-label="Close clue"
    >
      <div
        className="bg-jeopardy-navy rounded-lg w-full max-w-5xl border-4 border-jeopardy-gold/60 shadow-2xl animate-clue-in flex flex-col max-h-[92vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-3 border-b-2 border-jeopardy-gold/40">
          <span className="font-display text-jeopardy-gold text-5xl tracking-wider">
            ${clue.value}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close clue"
            className="text-jeopardy-cream/60 hover:text-jeopardy-cream text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12 text-center overflow-y-auto">
          <p className="font-display text-white text-shadow-clue uppercase leading-tight tracking-wide text-3xl sm:text-5xl md:text-6xl">
            {stripHtmlForDisplay(clue.question)}
          </p>
        </div>

        {revealed && (
          <div className="px-8 pb-6 text-center border-t border-jeopardy-gold/20 pt-6">
            <p className="text-jeopardy-cream/60 text-xs uppercase tracking-widest mb-2">
              Answer
            </p>
            <p className="font-display text-jeopardy-gold text-4xl uppercase tracking-wide">
              {clue.answer}
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-t-2 border-jeopardy-gold/40">
          {phase.kind === 'pick' && (
            <PickPhase
              players={remaining}
              allPlayers={players}
              selectedPlayerId={selectedPlayerId}
              setSelectedPlayerId={setSelectedPlayerId}
              answerText={answerText}
              setAnswerText={setAnswerText}
              onSubmit={submit}
              onReread={() => speak(clue.question)}
              onNobody={onClose}
              penalty={penalty}
              clueValue={clue.value}
            />
          )}

          {phase.kind === 'judging' && (
            <p className="text-jeopardy-cream/80 italic text-center py-4">
              Judging "{phase.playerAnswer}"…
            </p>
          )}

          {phase.kind === 'correct' && (
            <CorrectPhase
              playerName={players.find((p) => p.id === phase.playerId)?.name ?? '?'}
              playerAnswer={phase.playerAnswer}
              reasoning={phase.reasoning}
              clueValue={clue.value}
              onApprove={approve}
              onReject={rejectCorrectRuling}
            />
          )}

          {phase.kind === 'incorrect' && (
            <IncorrectPhase
              playerName={players.find((p) => p.id === phase.playerId)?.name ?? '?'}
              reasoning={phase.reasoning}
              penaltyApplied={
                penalty.active && phase.playerId === penalty.leaderId ? clue.value : 0
              }
              remainingCount={remaining.length}
              onContinue={resetForNextAttempt}
              onNobody={onClose}
            />
          )}

          {phase.kind === 'judge_unavailable' && (
            <FallbackPhase
              message={phase.message}
              players={players}
              clueValue={clue.value}
              onAward={manualAward}
              onNobody={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type PickProps = {
  players: Player[];
  allPlayers: Player[];
  selectedPlayerId: number | null;
  setSelectedPlayerId: (id: number) => void;
  answerText: string;
  setAnswerText: (s: string) => void;
  onSubmit: () => void;
  onReread: () => void;
  onNobody: () => void;
  penalty: ReturnType<typeof leaderPenalty>;
  clueValue: number;
};

function PickPhase({
  players,
  allPlayers,
  selectedPlayerId,
  setSelectedPlayerId,
  answerText,
  setAnswerText,
  onSubmit,
  onReread,
  onNobody,
  penalty,
  clueValue,
}: PickProps) {
  const submittable = selectedPlayerId != null && answerText.trim().length > 0;
  const lockedOutCount = allPlayers.length - players.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {players.map((p) => {
          const isLeader = penalty.active && p.id === penalty.leaderId;
          const selected = p.id === selectedPlayerId;
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => setSelectedPlayerId(p.id)}
              className={`px-3 py-2 rounded text-sm font-bold transition-colors ${
                selected
                  ? 'bg-jeopardy-gold text-jeopardy-navy-deep'
                  : 'bg-white/10 text-jeopardy-cream hover:bg-white/20'
              }`}
            >
              {p.name}
              {isLeader && (
                <span
                  className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70"
                  title={`Wrong answer deducts $${clueValue}`}
                >
                  ⚡
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && submittable) onSubmit();
          }}
          placeholder={
            selectedPlayerId == null
              ? 'Pick a player above…'
              : 'Type their answer and press Enter…'
          }
          className="flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
          disabled={selectedPlayerId == null}
          autoFocus
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!submittable}
          className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-40"
        >
          Submit
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReread}
            className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
          >
            ↻ Re-read
          </button>
          <button
            type="button"
            onClick={onNobody}
            className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
          >
            Nobody got it
          </button>
        </div>
        <p className="text-xs text-jeopardy-cream/40">
          {lockedOutCount > 0 && `${lockedOutCount} locked out · `}
          {penalty.active && `⚡ leader penalty −$${clueValue} on wrong answer`}
        </p>
      </div>
    </div>
  );
}

function CorrectPhase({
  playerName,
  playerAnswer,
  reasoning,
  clueValue,
  onApprove,
  onReject,
}: {
  playerName: string;
  playerAnswer: string;
  reasoning: string;
  clueValue: number;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-green-600/20 border border-green-500/40 rounded p-3">
        <p className="text-green-300 font-bold text-sm uppercase tracking-widest mb-1">
          ✓ Correct (per Claude)
        </p>
        <p className="text-jeopardy-cream text-sm">
          <span className="font-bold">{playerName}</span> said "{playerAnswer}"
        </p>
        <p className="text-jeopardy-cream/60 text-xs italic mt-1">{reasoning}</p>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onReject}
          className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
        >
          Reject — Claude is wrong
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
        >
          Approve · +${clueValue} to {playerName}
        </button>
      </div>
    </div>
  );
}

function IncorrectPhase({
  playerName,
  reasoning,
  penaltyApplied,
  remainingCount,
  onContinue,
  onNobody,
}: {
  playerName: string;
  reasoning: string;
  penaltyApplied: number;
  remainingCount: number;
  onContinue: () => void;
  onNobody: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-red-600/20 border border-red-500/40 rounded p-3">
        <p className="text-red-300 font-bold text-sm uppercase tracking-widest mb-1">
          ✗ Incorrect
        </p>
        <p className="text-jeopardy-cream text-sm">
          <span className="font-bold">{playerName}</span> got it wrong — locked out for this clue
        </p>
        {penaltyApplied > 0 && (
          <p className="text-red-300 text-sm mt-1">
            ⚡ Leader penalty applied: −${penaltyApplied}
          </p>
        )}
        <p className="text-jeopardy-cream/60 text-xs italic mt-1">{reasoning}</p>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onNobody}
          className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
        >
          Nobody got it
        </button>
        {remainingCount > 0 && (
          <button
            type="button"
            onClick={onContinue}
            className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
          >
            Next attempt ({remainingCount} left)
          </button>
        )}
      </div>
    </div>
  );
}

function FallbackPhase({
  message,
  players,
  clueValue,
  onAward,
  onNobody,
}: {
  message: string;
  players: Player[];
  clueValue: number;
  onAward: (playerId: number, delta: number) => Promise<void>;
  onNobody: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-yellow-600/20 border border-yellow-500/40 rounded p-3">
        <p className="text-yellow-300 font-bold text-sm uppercase tracking-widest mb-1">
          Judge unavailable
        </p>
        <p className="text-jeopardy-cream/80 text-sm">{message}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between bg-white/5 rounded px-3 py-2"
          >
            <span className="text-jeopardy-cream font-medium">{p.name}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onAward(p.id, clueValue)}
                className="px-2 py-1 bg-green-600/40 hover:bg-green-600/70 text-white rounded text-sm font-mono"
              >
                +{clueValue}
              </button>
              <button
                type="button"
                onClick={() => onAward(p.id, -clueValue)}
                className="px-2 py-1 bg-red-600/40 hover:bg-red-600/70 text-white rounded text-sm font-mono"
              >
                −{clueValue}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNobody}
          className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
        >
          Nobody got it
        </button>
      </div>
    </div>
  );
}

function stripHtmlForDisplay(s: string): string {
  return s.replace(/<a[^>]*>(.*?)<\/a>/g, '$1').replace(/<[^>]+>/g, '');
}
