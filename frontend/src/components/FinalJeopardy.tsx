import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoom } from '../context/RoomContext';
import { useHostContext } from '../context/HostContext';
import { useFinalTheme } from '../hooks/useFinalTheme';
import type { FinalState } from '../api';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
function formatAirDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function FinalJeopardy() {
  const { isHost, members, socketId, game, actions } = useRoom();
  const final = game.final;
  const myPlayerId = members.find((m) => m.socketId === socketId)?.playerId ?? null;

  if (!final) return null;
  return (
    <div className="flex-1 rounded-lg bg-jeopardy-navy p-6 flex flex-col gap-6 border-2 border-jeopardy-gold/30">
      <Header final={final} />
      {final.phase === 'wagering' && (
        <WagerPhase
          final={final}
          isHost={isHost}
          myPlayerId={myPlayerId}
          onWager={actions.finalWager}
          onForce={actions.forceFinalAnswer}
        />
      )}
      {final.phase === 'answering' && (
        <AnswerPhase
          final={final}
          isHost={isHost}
          myPlayerId={myPlayerId}
          onAnswer={actions.finalAnswer}
        />
      )}
      {final.phase === 'revealed' && (
        <RevealPhase
          final={final}
          isHost={isHost}
          onRule={actions.ruleFinal}
          onApply={actions.applyFinal}
          onEnd={actions.endGame}
        />
      )}
    </div>
  );
}

function Header({ final }: { final: FinalState }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-display text-jeopardy-gold text-4xl tracking-wider uppercase text-shadow-tile">
        {final.category}
      </h2>
      <span className="text-jeopardy-cream/40 text-xs uppercase tracking-widest shrink-0">
        Final Jeopardy
        {final.airDate && ` · ${formatAirDate(final.airDate)}`}
      </span>
    </div>
  );
}

function WagerPhase({
  final,
  isHost,
  myPlayerId,
  onWager,
  onForce,
}: {
  final: FinalState;
  isHost: boolean;
  myPlayerId: number | null;
  onWager: (w: number) => Promise<{ ok: boolean; error?: string }>;
  onForce: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const startingIds = useMemo(
    () => Object.keys(final.starting).map(Number),
    [final.starting],
  );
  const myEligible = myPlayerId != null && Boolean(final.starting[myPlayerId]);
  const myStart = myEligible ? final.starting[myPlayerId!] : null;
  const myEntry = myEligible ? final.entries[myPlayerId!] : null;
  const [wager, setWager] = useState(myEntry?.wager?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Math.floor(Number(wager));
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a number ≥ 0.');
      return;
    }
    if (myStart && n > myStart.score) {
      setError(`Max wager: $${myStart.score.toLocaleString()}`);
      return;
    }
    setBusy(true);
    try {
      const resp = await onWager(n);
      if (!resp.ok) setError(resp.error ?? 'failed to submit wager');
    } finally {
      setBusy(false);
    }
  }

  const wageredCount = startingIds.filter((id) => final.entries[id].wagered).length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-jeopardy-cream/80">
        Make your wager based on the category above. Wagers stay private until reveal.
      </p>

      {!myEligible && !isHost && (
        <p className="text-jeopardy-cream/50 italic">
          You're not eligible for Final Jeopardy — your score is $0 or less.
        </p>
      )}

      {myEligible && !myEntry?.wagered && (
        <form onSubmit={submit} className="flex flex-col gap-2 max-w-sm">
          <label className="text-jeopardy-cream/70 text-sm">
            Your score: ${myStart!.score.toLocaleString()} (max wager)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={myStart!.score}
              value={wager}
              onChange={(e) => setWager(e.target.value)}
              placeholder="Wager"
              className="flex-1 px-3 py-2 rounded bg-white/10 text-jeopardy-cream border border-jeopardy-gold/30"
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || !wager}
              className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
            >
              Submit
            </button>
          </div>
          {error && <p className="text-red-300 text-xs">{error}</p>}
        </form>
      )}

      {myEligible && myEntry?.wagered && (
        <p className="text-jeopardy-gold">
          ✓ Your wager (${myEntry.wager?.toLocaleString()}) is in. Waiting for others.
        </p>
      )}

      <WagerStatusList final={final} />

      <p className="text-jeopardy-cream/60 text-sm">
        {wageredCount} / {startingIds.length} wagers in.
      </p>

      {isHost && (
        <button
          type="button"
          onClick={() => onForce()}
          className="self-start px-4 py-2 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
        >
          Force start answer phase
        </button>
      )}
    </div>
  );
}

function AnswerPhase({
  final,
  isHost,
  myPlayerId,
  onAnswer,
}: {
  final: FinalState;
  isHost: boolean;
  myPlayerId: number | null;
  onAnswer: (text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const myEligible = myPlayerId != null && Boolean(final.starting[myPlayerId]);
  const myEntry = myEligible ? final.entries[myPlayerId!] : null;
  const [answer, setAnswer] = useState(myEntry?.answer ?? '');
  const [submitted, setSubmitted] = useState(Boolean(myEntry?.answered));
  const [secondsLeft, setSecondsLeft] = useState(() =>
    final.answerDeadline ? Math.max(0, Math.ceil((final.answerDeadline - Date.now()) / 1000)) : 30,
  );

  // Theme song plays on the host's machine for the duration of the answer phase.
  useFinalTheme(isHost);

  useEffect(() => {
    if (!final.answerDeadline) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((final.answerDeadline! - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [final.answerDeadline]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitted) return;
    setSubmitted(true);
    const resp = await onAnswer(answer.trim());
    if (!resp.ok) setSubmitted(false);
  }

  const startingIds = Object.keys(final.starting).map(Number);
  const answeredCount = startingIds.filter((id) => final.entries[id].answered).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-jeopardy-navy-deep p-6 border border-jeopardy-gold/30">
        <p className="text-jeopardy-cream text-2xl leading-relaxed">{final.question}</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-display text-jeopardy-gold text-3xl tabular-nums">
          {secondsLeft}s
        </span>
        <span className="text-jeopardy-cream/60 text-sm">
          {answeredCount} / {startingIds.length} answers in
        </span>
      </div>

      {!myEligible && !isHost && (
        <p className="text-jeopardy-cream/50 italic">Not eligible — sit tight.</p>
      )}

      {myEligible && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={submitted}
            placeholder="What is..."
            className="px-3 py-3 rounded bg-white/10 text-jeopardy-cream border border-jeopardy-gold/30 text-lg disabled:opacity-60"
            autoFocus
          />
          <button
            type="submit"
            disabled={submitted || !answer.trim()}
            className="self-start px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-50"
          >
            {submitted ? '✓ Submitted' : 'Lock in answer'}
          </button>
        </form>
      )}
    </div>
  );
}

function RevealPhase({
  final,
  isHost,
  onRule,
  onApply,
  onEnd,
}: {
  final: FinalState;
  isHost: boolean;
  onRule: (playerId: number, correct: boolean) => Promise<{ ok: boolean; error?: string }>;
  onApply: () => Promise<{ ok: boolean; error?: string }>;
  onEnd: () => Promise<{ ok: boolean; error?: string }>;
}) {
  // Make sure the theme stops if we transitioned in the middle of it.
  useFinalTheme(false);
  const { playClip } = useHostContext();

  const startingIds = Object.keys(final.starting).map(Number);
  const appliedRef = useRef(false);
  const [applied, setApplied] = useState(false);

  async function applyRulings() {
    if (appliedRef.current) return;
    appliedRef.current = true;
    const resp = await onApply();
    if (!resp.ok) {
      appliedRef.current = false;
      return;
    }
    setApplied(true);
  }

  async function endGame() {
    await playClip('goodbye');
    await onEnd();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-jeopardy-navy-deep p-6 border border-jeopardy-gold/30">
        <p className="text-jeopardy-cream text-xl leading-relaxed mb-4">
          {final.question}
        </p>
        <p className="text-jeopardy-gold text-2xl font-display tracking-wide">
          {final.answer}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {startingIds.map((id) => {
          const start = final.starting[id];
          const e = final.entries[id];
          const correct = e.correct === true;
          const incorrect = e.correct === false;
          const delta = e.wager == null ? 0 : correct ? e.wager : -e.wager;
          return (
            <li
              key={id}
              className={`rounded p-3 border ${
                correct ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/40 bg-red-500/5'
              }`}
            >
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-jeopardy-cream font-bold">{start.name}</span>
                <span
                  className={`font-display ${
                    delta >= 0 ? 'text-jeopardy-gold' : 'text-red-300'
                  } tabular-nums`}
                >
                  {delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()}
                </span>
              </div>
              <div className="text-jeopardy-cream/80 text-sm mt-1">
                <span className="text-jeopardy-cream/50">Answer:</span>{' '}
                {e.answer ? (
                  `"${e.answer}"`
                ) : (
                  <em className="text-jeopardy-cream/40">no answer</em>
                )}
                <span className="ml-3 text-jeopardy-cream/50">Wager:</span>{' '}
                ${e.wager?.toLocaleString() ?? 0}
              </div>
              {e.reasoning && (
                <p className="text-jeopardy-cream/50 text-xs italic mt-1">{e.reasoning}</p>
              )}
              {isHost && !applied && (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onRule(id, true)}
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      correct
                        ? 'bg-green-500 text-jeopardy-navy-deep'
                        : 'bg-white/10 text-jeopardy-cream hover:bg-white/20'
                    }`}
                  >
                    Correct
                  </button>
                  <button
                    type="button"
                    onClick={() => onRule(id, false)}
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      incorrect
                        ? 'bg-red-500 text-white'
                        : 'bg-white/10 text-jeopardy-cream hover:bg-white/20'
                    }`}
                  >
                    Incorrect
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isHost && (
        <div className="flex gap-3 mt-2">
          {!applied ? (
            <button
              type="button"
              onClick={applyRulings}
              className="px-5 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-lg tracking-wide hover:bg-jeopardy-cream"
            >
              Apply Rulings
            </button>
          ) : (
            <button
              type="button"
              onClick={endGame}
              className="px-5 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-display text-lg tracking-wide hover:bg-jeopardy-cream"
            >
              Wrap Up &amp; End Game
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WagerStatusList({ final }: { final: FinalState }) {
  const ids = Object.keys(final.starting).map(Number);
  return (
    <ul className="flex flex-col gap-1">
      {ids.map((id) => {
        const start = final.starting[id];
        const wagered = final.entries[id].wagered;
        return (
          <li key={id} className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                wagered ? 'bg-green-400' : 'bg-jeopardy-cream/30'
              }`}
            />
            <span className="text-jeopardy-cream/80">{start.name}</span>
            <span className="text-jeopardy-cream/40 text-xs">
              {wagered ? 'wagered' : 'still wagering...'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
