import { useMemo, useState } from 'react';
import { useHostContext } from '../context/HostContext';
import { useRoom } from '../context/RoomContext';
import { leaderPenalty } from '../lib/penalty';

type Pending = NonNullable<
  NonNullable<ReturnType<typeof useRoom>['game']['activeClue']>['pendingJudgement']
>;

export function ClueModal() {
  const { speak } = useHostContext();
  const { isHost, game, members, scores, socketId, actions } = useRoom();
  const clue = game.activeClue;
  if (!clue) return null;

  const me = socketId ? members.find((m) => m.socketId === socketId) : null;
  const myPlayerId = me?.playerId ?? null;

  const lockedOut = myPlayerId !== null && clue.lockedOutPlayerIds.includes(myPlayerId);
  const isMyBuzz = myPlayerId !== null && clue.buzzedPlayerId === myPlayerId;
  const someoneElseBuzzed =
    clue.buzzedPlayerId !== null && clue.buzzedPlayerId !== myPlayerId;
  const buzzerOpen =
    !clue.revealed && !clue.pendingJudgement && clue.buzzedPlayerId === null;
  const pending = clue.pendingJudgement;
  const buzzedName =
    clue.buzzedPlayerId !== null
      ? scores.find((s) => s.playerId === clue.buzzedPlayerId)?.name ?? 'Someone'
      : null;

  const penalty = useMemo(
    () =>
      leaderPenalty(scores.map((s) => ({ id: s.playerId, score: s.score }))),
    [scores],
  );
  const penaltyLeader = penalty.active ? penalty.leaderId : null;

  const canBuzz = myPlayerId !== null && buzzerOpen && !lockedOut;
  const onClose = isHost ? () => actions.closeClue() : undefined;

  return (
    <ModalShell
      clueValue={clue.value}
      revealed={clue.revealed}
      answer={clue.answer}
      question={clue.question}
      onClose={onClose}
    >
      <div className="px-6 py-4 border-t-2 border-jeopardy-gold/40 flex flex-col gap-3">
        {/* Player buzz button — anyone with identity who isn't locked out */}
        {canBuzz && (
          <button
            type="button"
            onClick={() => actions.buzz()}
            className="w-full py-8 bg-red-600 hover:bg-red-500 active:scale-95 transition-all rounded-lg font-display text-jeopardy-cream text-5xl tracking-[0.4em] shadow-lg"
          >
            BUZZ
          </button>
        )}

        {/* Locked-out player */}
        {myPlayerId !== null && lockedOut && !pending && !isMyBuzz && (
          <p className="text-red-300/70 italic text-center text-sm">
            You're locked out for this clue.
          </p>
        )}

        {/* I'm typing my answer */}
        {isMyBuzz && !pending && <MyAnswerInput actions={actions} />}

        {/* Someone else is typing — watch panel */}
        {someoneElseBuzzed && !pending && (
          <BuzzedPanel
            name={buzzedName ?? 'Someone'}
            typing={clue.typingAnswer}
            isHost={isHost}
            onCancel={() => actions.cancelBuzz()}
          />
        )}

        {/* Awaiting buzz — host control row (always present for host) */}
        {isHost && buzzerOpen && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-jeopardy-cream/70 text-sm">
                {canBuzz
                  ? 'You can buzz, or wait for someone else.'
                  : 'Waiting for someone to buzz in…'}
              </p>
              {clue.lockedOutPlayerIds.length > 0 && (
                <p className="text-jeopardy-cream/40 text-xs">
                  Locked out:{' '}
                  {clue.lockedOutPlayerIds
                    .map((pid) => scores.find((s) => s.playerId === pid)?.name ?? `#${pid}`)
                    .join(', ')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => speak(clue.question)}
                className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
              >
                ↻ Re-read
              </button>
              <button
                type="button"
                onClick={() => actions.revealAnswer()}
                className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
              >
                Reveal Answer
              </button>
              <button
                type="button"
                onClick={() => actions.closeClue()}
                className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
              >
                Nobody got it
              </button>
            </div>
          </div>
        )}

        {/* Judging spinner */}
        {pending && pending.state === 'judging' && (
          <div className="bg-yellow-500/20 border border-yellow-400/40 rounded p-3">
            <p className="text-yellow-200 italic text-sm">
              Claude is judging "{pending.answer}"…
            </p>
          </div>
        )}

        {/* Verdict — different surface for host vs player */}
        {pending && pending.state !== 'judging' && (
          isHost ? (
            <HostVerdict
              pending={pending}
              clueValue={clue.value}
              onCorrect={() => actions.ruleCorrect()}
              onIncorrect={() => actions.ruleIncorrect()}
              penaltyLeaderId={penaltyLeader}
            />
          ) : (
            <PlayerVerdict pending={pending} mine={pending.playerId === myPlayerId} />
          )
        )}

        {/* Bystander hint */}
        {!isHost && !myPlayerId && (
          <p className="text-jeopardy-cream/60 text-sm italic text-center">
            Pick your name from the prompt to play.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

function MyAnswerInput({ actions }: { actions: ReturnType<typeof useRoom>['actions'] }) {
  const [text, setText] = useState('');

  function update(value: string) {
    setText(value);
    void actions.typing(value);
  }

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    void actions.submit(trimmed);
    setText('');
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-green-300 font-bold text-sm uppercase tracking-widest">
        Your turn — what's your answer?
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Type your answer…"
          className="min-w-0 flex-1 px-3 py-3 rounded bg-white/10 text-jeopardy-cream text-lg border border-jeopardy-gold/30"
          autoFocus
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="shrink-0 px-5 py-3 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-40"
        >
          Submit
        </button>
      </div>
      <p className="text-jeopardy-cream/40 text-xs italic">
        Everyone sees what you type live — be quick.
      </p>
    </div>
  );
}

function BuzzedPanel({
  name,
  typing,
  isHost,
  onCancel,
}: {
  name: string;
  typing: string;
  isHost: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="bg-blue-500/20 border border-blue-400/40 rounded p-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-blue-300 font-bold text-sm uppercase tracking-widest mb-1">
          {name} is answering
        </p>
        <p className="text-jeopardy-cream text-base font-mono min-h-[1.5em]">
          {typing || <span className="opacity-40">typing…</span>}
        </p>
      </div>
      {isHost && (
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm shrink-0"
        >
          Cancel buzz
        </button>
      )}
    </div>
  );
}

function HostVerdict({
  pending,
  clueValue,
  onCorrect,
  onIncorrect,
  penaltyLeaderId,
}: {
  pending: Pending;
  clueValue: number;
  onCorrect: () => void;
  onIncorrect: () => void;
  penaltyLeaderId: number | null;
}) {
  const claudeSaysCorrect = pending.state === 'correct';
  const wouldDeduct = penaltyLeaderId === pending.playerId;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded p-3 border ${
          claudeSaysCorrect
            ? 'bg-green-600/20 border-green-500/40'
            : 'bg-red-600/20 border-red-500/40'
        }`}
      >
        <p
          className={`font-bold text-sm uppercase tracking-widest mb-1 ${
            claudeSaysCorrect ? 'text-green-300' : 'text-red-300'
          }`}
        >
          {claudeSaysCorrect ? '✓ Claude says correct' : '✗ Claude says incorrect'}
        </p>
        <p className="text-jeopardy-cream text-sm">
          <span className="font-bold">{pending.playerName}</span> said "
          {pending.answer}"
        </p>
        {pending.reasoning && (
          <p className="text-jeopardy-cream/60 text-xs italic mt-1">
            {pending.reasoning}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        {claudeSaysCorrect ? (
          <>
            <button
              type="button"
              onClick={onIncorrect}
              className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
            >
              Override → Wrong
            </button>
            <button
              type="button"
              onClick={onCorrect}
              className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
            >
              Approve · +${clueValue} to {pending.playerName}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onCorrect}
              className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded text-sm hover:bg-white/20"
            >
              Override → Right (+${clueValue})
            </button>
            <button
              type="button"
              onClick={onIncorrect}
              className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-gold/80"
            >
              Confirm · lock out {pending.playerName}
              {wouldDeduct && (
                <span className="block text-[10px] uppercase tracking-widest opacity-70 mt-0.5">
                  ⚡ −${clueValue} leader penalty
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerVerdict({ pending, mine }: { pending: Pending; mine: boolean }) {
  const isCorrect = pending.state === 'correct';
  return (
    <div
      className={`rounded p-3 border ${
        isCorrect
          ? 'bg-green-600/20 border-green-500/40'
          : 'bg-red-600/20 border-red-500/40'
      }`}
    >
      <p
        className={`font-bold text-sm uppercase tracking-widest mb-1 ${
          isCorrect ? 'text-green-300' : 'text-red-300'
        }`}
      >
        {mine
          ? isCorrect
            ? '✓ Claude says you got it'
            : '✗ Claude says incorrect'
          : `${pending.playerName}: ${isCorrect ? 'Claude says correct' : 'Claude says incorrect'}`}
      </p>
      <p className="text-jeopardy-cream text-sm">"{pending.answer}"</p>
      {pending.reasoning && (
        <p className="text-jeopardy-cream/60 text-xs italic mt-1">
          {pending.reasoning}
        </p>
      )}
      <p className="text-jeopardy-cream/40 text-xs mt-2 italic">
        Awaiting host's final ruling…
      </p>
    </div>
  );
}

function ModalShell({
  clueValue,
  question,
  answer,
  revealed,
  onClose,
  children,
}: {
  clueValue: number;
  question: string;
  answer: string;
  revealed: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 ${onClose ? 'cursor-pointer' : ''}`}
      onClick={onClose}
      role={onClose ? 'button' : undefined}
      tabIndex={onClose ? -1 : undefined}
      aria-label={onClose ? 'Close clue' : undefined}
    >
      <div
        className="bg-jeopardy-navy rounded-lg w-full max-w-5xl border-4 border-jeopardy-gold/60 shadow-2xl animate-clue-in flex flex-col max-h-[92vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-3 border-b-2 border-jeopardy-gold/40">
          <span className="font-display text-jeopardy-gold text-5xl tracking-wider">
            ${clueValue}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close clue"
              className="text-jeopardy-cream/60 hover:text-jeopardy-cream text-2xl"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12 text-center overflow-y-auto">
          <p className="font-display text-white text-shadow-clue uppercase leading-tight tracking-wide text-3xl sm:text-5xl md:text-6xl">
            {stripHtmlForDisplay(question)}
          </p>
        </div>

        {revealed && (
          <div className="px-8 pb-6 text-center border-t border-jeopardy-gold/20 pt-6">
            <p className="text-jeopardy-cream/60 text-xs uppercase tracking-widest mb-2">
              Answer
            </p>
            <p className="font-display text-jeopardy-gold text-4xl uppercase tracking-wide">
              {answer}
            </p>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

function stripHtmlForDisplay(s: string): string {
  return s.replace(/<a[^>]*>(.*?)<\/a>/g, '$1').replace(/<[^>]+>/g, '');
}
