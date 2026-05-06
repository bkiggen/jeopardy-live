import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GameBoard } from '../components/GameBoard';
import { ScoreBoard } from '../components/ScoreBoard';
import { CharacterCanvas } from '../components/CharacterCanvas';
import { PlayerIdentityPrompt } from '../components/PlayerIdentityPrompt';
import { HostAwayBanner } from '../components/HostAwayBanner';
import { MembershipToasts } from '../components/MembershipToasts';
import { RoomProvider, useRoom } from '../context/RoomContext';

export function Room() {
  const { code } = useParams<{ code: string }>();
  const [search] = useSearchParams();
  const isHost = search.get('host') === '1';

  if (!code || code.length < 2 || code.length > 8) {
    return <RoomError message="Invalid room code." />;
  }

  return (
    <RoomProvider code={code.toUpperCase()} isHost={isHost}>
      <RoomShell />
    </RoomProvider>
  );
}

function RoomShell() {
  const navigate = useNavigate();
  const { code, isHost, teamName, status, errorMessage, members } = useRoom();

  if (status === 'closed' || status === 'error') {
    return <RoomError message={errorMessage ?? 'Connection lost.'} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <RoomHeader
        code={code}
        teamName={teamName}
        isHost={isHost}
        status={status}
        memberCount={members.length}
      />
      <HostAwayBanner />
      <main className="flex-1 grid grid-cols-[1fr_320px] gap-4 p-4">
        <section className="flex flex-col gap-4">
          {isHost && (
            <div className="flex justify-center">
              <CharacterCanvas />
            </div>
          )}
          <GameBoard />
        </section>
        <aside>
          <ScoreBoard />
        </aside>
      </main>
      <PlayerIdentityPrompt />
      <MembershipToasts />
      <button
        type="button"
        onClick={() => navigate('/')}
        className="fixed bottom-4 left-4 text-jeopardy-cream/40 hover:text-jeopardy-cream/80 text-xs uppercase tracking-widest"
      >
        ← Leave
      </button>
    </div>
  );
}

function RoomHeader({
  code,
  teamName,
  isHost,
  status,
  memberCount,
}: {
  code: string;
  teamName: string | null;
  isHost: boolean;
  status: string;
  memberCount: number;
}) {
  const shareUrl = `${window.location.origin}/r/${code}`;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b-2 border-jeopardy-gold/40 bg-jeopardy-navy-darker">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="font-display text-jeopardy-gold text-2xl tracking-widest text-shadow-tile hover:opacity-80"
        >
          STANDUP JEOPARDY
        </Link>
        {teamName && (
          <span className="text-jeopardy-cream font-bold text-base truncate max-w-[16rem]">
            · {teamName}
          </span>
        )}
        <span className="px-2 py-0.5 rounded border border-jeopardy-gold/50 text-jeopardy-gold/80 text-xs uppercase tracking-widest">
          {isHost ? 'host' : 'player'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={copyLink}
          className="text-jeopardy-cream/70 hover:text-jeopardy-cream text-xs uppercase tracking-widest"
        >
          {copied ? '✓ link copied' : 'Copy invite link'}
        </button>
        <span className="font-display text-jeopardy-gold text-3xl tracking-[0.4em]">
          {code}
        </span>
        <span
          className={`text-xs uppercase tracking-widest ${
            status === 'connected'
              ? 'text-green-400'
              : status === 'connecting'
                ? 'text-yellow-400'
                : 'text-red-400'
          }`}
          title={`${memberCount} connected`}
        >
          ● {status}
        </span>
      </div>
    </header>
  );
}

function RoomError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <h2 className="font-display text-jeopardy-gold text-4xl tracking-widest">
        ROOM UNAVAILABLE
      </h2>
      <p className="text-jeopardy-cream/70 text-center max-w-md">{message}</p>
      <Link
        to="/"
        className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold hover:bg-jeopardy-cream"
      >
        Back to start
      </Link>
    </div>
  );
}
