import { useEffect, useMemo, useRef, useState } from 'react';
import { useHostContext } from '../context/HostContext';
import { useRoom } from '../context/RoomContext';
import { useSettings } from '../hooks/useSettings';
import { leaderPenalty } from '../lib/penalty';
import type { SoundClip } from '../hooks/useHost';

type Pending = NonNullable<
  NonNullable<ReturnType<typeof useRoom>['game']['activeClue']>['pendingJudgement']
>;

// Renders inline inside the GameBoard panel (not a modal). The host's clue
// content fills the same space the tile grid normally occupies, so the host
// avatar above stays visible the whole time.

export function ClueModal() {
  const { playClip, playBuzz, playTimeUp } = useHostContext();
  const { isHost, game, members, scores, socketId, actions } = useRoom();
  const { settings } = useSettings();
  const buzzTimeoutMs = settings.buzzAnswerSeconds * 1000;
  const clue = game.activeClue;

  // Fire the buzzer sound on the host's machine when a player buzzes in.
  // Players who buzzed get audio via the host's screen-share over Zoom.
  const buzzedId = clue?.buzzedPlayerId ?? null;
  const prevBuzzedRef = useRef<number | null>(buzzedId);
  useEffect(() => {
    if (
      isHost &&
      prevBuzzedRef.current === null &&
      buzzedId !== null
    ) {
      playBuzz();
    }
    prevBuzzedRef.current = buzzedId;
  }, [buzzedId, isHost, playBuzz]);

  // Read-window countdown: buzzes are blocked for a few seconds after a
  // clue is revealed so slow readers aren't lapped by trigger-happy buzzers.
  const buzzableAt = clue?.buzzableAt ?? 0;
  const [readMsLeft, setReadMsLeft] = useState<number>(() =>
    Math.max(0, buzzableAt - Date.now()),
  );
  useEffect(() => {
    const tick = () => setReadMsLeft(Math.max(0, buzzableAt - Date.now()));
    tick();
    if (buzzableAt <= Date.now()) return;
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [buzzableAt]);
  const inReadWindow = readMsLeft > 0;

  // Countdown + time-up sound
  const buzzedAt = clue?.buzzedAt ?? null;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const timeUpFiredRef = useRef(false);
  useEffect(() => {
    if (!buzzedAt) {
      setRemainingMs(null);
      timeUpFiredRef.current = false;
      return;
    }
    timeUpFiredRef.current = false;
    const tick = () => {
      const elapsed = Date.now() - buzzedAt;
      const remaining = Math.max(0, buzzTimeoutMs - elapsed);
      setRemainingMs(remaining);
      if (remaining <= 0 && !timeUpFiredRef.current) {
        timeUpFiredRef.current = true;
        if (isHost) playTimeUp();
      }
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [buzzedAt, isHost, playTimeUp, buzzTimeoutMs]);

  const penalty = useMemo(
    () =>
      leaderPenalty(scores.map((s) => ({ id: s.playerId, score: s.score }))),
    [scores],
  );
  const penaltyLeader = penalty.active ? penalty.leaderId : null;

  if (!clue) return null;

  async function ruleCorrect() {
    const resp = await actions.ruleCorrect();
    if (resp.ok) void playClip('correct');
  }

  async function ruleIncorrect() {
    const wasPenalty =
      clue?.pendingJudgement?.playerId !== undefined &&
      penaltyLeader === clue.pendingJudgement.playerId;
    const resp = await actions.ruleIncorrect();
    if (resp.ok) {
      const clip: SoundClip = wasPenalty ? 'penalty' : 'incorrect';
      void playClip(clip);
    }
  }

  const me = socketId ? members.find((m) => m.socketId === socketId) : null;
  const myPlayerId = me?.playerId ?? null;
  const myScore = myPlayerId != null ? scores.find((s) => s.playerId === myPlayerId) : null;
  const allCaps = myScore?.prefersAllCaps ?? true;
  const caseClass = allCaps ? 'uppercase' : 'normal-case';

  const lockedOut =
    myPlayerId !== null && clue.lockedOutPlayerIds.includes(myPlayerId);
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
  const canBuzz =
    myPlayerId !== null && buzzerOpen && !lockedOut && !inReadWindow;
  const showReadWindow = buzzerOpen && inReadWindow;

  return (
    <div className="flex-1 flex flex-col gap-4 animate-clue-in">
      {/* Question */}
      <div className="flex-1 flex items-center justify-center text-center px-2">
        <p
          className={`font-display text-white text-shadow-clue ${caseClass} leading-tight tracking-wide text-3xl sm:text-4xl md:text-5xl`}
        >
          {stripHtmlForDisplay(clue.question)}
        </p>
      </div>

      {/* Answer */}
      {clue.revealed && (
        <div className="text-center border-t border-jeopardy-gold/20 pt-3">
          <p className="text-jeopardy-cream/60 text-xs uppercase tracking-widest mb-1">
            Answer
          </p>
          <p
            className={`font-display text-jeopardy-gold text-3xl ${caseClass} tracking-wide`}
          >
            {clue.answer}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="border-t-2 border-jeopardy-gold/40 pt-3 flex flex-col gap-3">
        {showReadWindow && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              className="flex-1 py-6 bg-white/10 rounded-lg font-display text-jeopardy-cream/70 text-4xl tracking-[0.4em] shadow-inner cursor-not-allowed"
              title="Read the clue — buzzers unlock in a moment"
            >
              READING · {Math.ceil(readMsLeft / 1000)}s
            </button>
            {myPlayerId !== null && !lockedOut && (
              <button
                type="button"
                onClick={() => actions.pass()}
                title="I don't know — lock me out for this clue"
                className="shrink-0 px-6 py-6 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-lg font-display text-jeopardy-cream/80 text-2xl tracking-widest"
              >
                PASS
              </button>
            )}
          </div>
        )}
        {canBuzz && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => actions.buzz()}
              className="flex-1 py-6 bg-red-600 hover:bg-red-500 active:scale-95 transition-all rounded-lg font-display text-jeopardy-cream text-4xl tracking-[0.4em] shadow-lg"
            >
              BUZZ
            </button>
            <button
              type="button"
              onClick={() => actions.pass()}
              title="I don't know — lock me out for this clue"
              className="shrink-0 px-6 py-6 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-lg font-display text-jeopardy-cream/80 text-2xl tracking-widest"
            >
              PASS
            </button>
          </div>
        )}

        {myPlayerId !== null && lockedOut && !pending && !isMyBuzz && (
          <p className="text-red-300/70 italic text-center text-sm">
            You're locked out for this clue.
          </p>
        )}

        {isMyBuzz && !pending && (
          <MyAnswerInput
            actions={actions}
            remainingMs={remainingMs}
            buzzAnswerSeconds={settings.buzzAnswerSeconds}
          />
        )}

        {someoneElseBuzzed && !pending && (
          <BuzzedPanel
            name={buzzedName ?? 'Someone'}
            typing={clue.typingAnswer}
            isHost={isHost}
            remainingMs={remainingMs}
            onCancel={() => actions.cancelBuzz()}
          />
        )}

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
            <button
              type="button"
              onClick={() => actions.revealAnswer()}
              className="px-3 py-1.5 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20 text-sm"
            >
              Reveal Answer
            </button>
          </div>
        )}

        {pending && pending.state === 'judging' && (
          <div className="bg-yellow-500/20 border border-yellow-400/40 rounded p-3">
            <p className="text-yellow-200 italic text-sm">
              Claude is judging "{pending.answer}"…
            </p>
          </div>
        )}

        {pending && pending.state !== 'judging' && (
          isHost ? (
            <HostVerdict
              pending={pending}
              clueValue={clue.value}
              onCorrect={ruleCorrect}
              onIncorrect={ruleIncorrect}
              penaltyLeaderId={penaltyLeader}
            />
          ) : (
            <PlayerVerdict pending={pending} mine={pending.playerId === myPlayerId} />
          )
        )}

        {!isHost && !myPlayerId && (
          <p className="text-jeopardy-cream/60 text-sm italic text-center">
            Pick your name from the prompt to play.
          </p>
        )}
      </div>
    </div>
  );
}

function MyAnswerInput({
  actions,
  remainingMs,
  buzzAnswerSeconds,
}: {
  actions: ReturnType<typeof useRoom>['actions'];
  remainingMs: number | null;
  buzzAnswerSeconds: number;
}) {
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
      <div className="flex items-center justify-between">
        <p className="text-green-300 font-bold text-sm uppercase tracking-widest">
          Your turn — what's your answer?
        </p>
        {remainingMs !== null && <Countdown ms={remainingMs} />}
      </div>
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
        {buzzAnswerSeconds} seconds. Everyone sees what you type live.
      </p>
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  const seconds = Math.ceil(ms / 1000);
  const danger = ms < 3000;
  return (
    <span
      className={`font-display text-2xl tracking-wider tabular-nums ${
        danger ? 'text-red-400 animate-pulse' : 'text-jeopardy-gold'
      }`}
    >
      {seconds}s
    </span>
  );
}

function BuzzedPanel({
  name,
  typing,
  isHost,
  remainingMs,
  onCancel,
}: {
  name: string;
  typing: string;
  isHost: boolean;
  remainingMs: number | null;
  onCancel: () => void;
}) {
  return (
    <div className="bg-blue-500/20 border border-blue-400/40 rounded p-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-blue-300 font-bold text-sm uppercase tracking-widest">
            {name} is answering
          </p>
          {remainingMs !== null && <Countdown ms={remainingMs} />}
        </div>
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

function stripHtmlForDisplay(s: string): string {
  return s.replace(/<a[^>]*>(.*?)<\/a>/g, '$1').replace(/<[^>]+>/g, '');
}
