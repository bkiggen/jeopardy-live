import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES } from '../lib/voices.js';

// Pre-generated audio clips for the game. Run once to generate every clip
// for every voice in lib/voices.ts:
//
//   cd backend && npm run generate-audio
//
// Files land at frontend/public/audio/<voice-id>/<clip-key>.mp3 — commit them
// so production never hits ElevenLabs at runtime.
//
// You only need ELEVENLABS_API_KEY locally; voice IDs are hard-coded in
// lib/voices.ts. Add a new voice by editing that list and re-running.

type Clip = { key: string; text: string };

const CLIPS: Clip[] = [
  // Host arrival — variant 1 keeps the unsuffixed key for back-compat with the
  // existing committed mp3; new variants use -N.
  { key: 'welcome', text: 'This is Jeopardy! Please select Single or Double Jeopardy.' },
  { key: 'welcome-2', text: 'Welcome to Jeopardy! Pick Single or Double Jeopardy to begin.' },
  { key: 'welcome-3', text: "It's time for Jeopardy! Single or Double — your call." },
  { key: 'welcome-4', text: 'Hello and welcome to Jeopardy! Single or Double Jeopardy?' },
  { key: 'welcome-5', text: 'Live from the Jeopardy stage — choose your round: Single or Double.' },

  // Round transitions
  { key: 'round-single', text: "Single Jeopardy! Let's see what you've got." },
  { key: 'round-single-2', text: "Here's the Single Jeopardy round. Good luck." },
  { key: 'round-single-3', text: 'Single Jeopardy — pick your first clue.' },
  { key: 'round-single-4', text: "Round one: Single Jeopardy. Let's play." },
  { key: 'round-single-5', text: 'Single Jeopardy is up. Make it count.' },

  { key: 'round-double', text: 'Double Jeopardy! The stakes just doubled.' },
  { key: 'round-double-2', text: 'And now, Double Jeopardy. Twice the points.' },
  { key: 'round-double-3', text: 'Double Jeopardy — every dollar counts twice as much.' },
  { key: 'round-double-4', text: 'Welcome to Double Jeopardy. Big money round.' },
  { key: 'round-double-5', text: "It's Double Jeopardy time. Buckle up." },

  { key: 'round-complete', text: "That's the end of the round." },
  { key: 'round-complete-2', text: "And that's the round." },
  { key: 'round-complete-3', text: 'Round complete. Nice work.' },
  { key: 'round-complete-4', text: 'Time to wrap up this round.' },
  { key: 'round-complete-5', text: "We're done with this round. Well played." },

  // Correct rulings — random variant on each fire
  { key: 'correct-1', text: 'Correct!' },
  { key: 'correct-2', text: 'Nice one.' },
  { key: 'correct-3', text: 'Right on the money.' },
  { key: 'correct-4', text: "That's it." },
  { key: 'correct-5', text: 'You got it.' },

  // Incorrect rulings
  { key: 'incorrect-1', text: "I'm afraid that's wrong." },
  { key: 'incorrect-2', text: 'Ooh, so close.' },
  { key: 'incorrect-3', text: 'Not quite.' },
  { key: 'incorrect-4', text: 'Sorry, no.' },
  { key: 'incorrect-5', text: "That's not it." },

  // Leader penalty
  { key: 'penalty', text: "That'll cost you." },
  { key: 'penalty-2', text: 'Ouch — points off the leader.' },
  { key: 'penalty-3', text: 'The leader pays for that one.' },
  { key: 'penalty-4', text: "Tough break, that's coming off the top." },
  { key: 'penalty-5', text: 'Cost the leader some money there.' },

  // End of game
  {
    key: 'goodbye',
    text:
      "And that's all for Jeopardy today. Thanks for playing, everyone. And remember: we've got all the points left to play for and the rest of our lives left to play. Good night.",
  },
  {
    key: 'goodbye-2',
    text: 'That wraps things up for today. Thanks for playing, everyone — see you next time.',
  },
  {
    key: 'goodbye-3',
    text: 'And on that note, we are done. Great game, all of you. Until next round.',
  },
  {
    key: 'goodbye-4',
    text: 'Good game, players. Tune in next time for more Jeopardy. Good night.',
  },
  {
    key: 'goodbye-5',
    text: "That's our show. Thanks for playing — see you next round.",
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../frontend/public/audio');

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY must be set in backend/.env');
  process.exit(1);
}

async function generate(voiceId: string, clip: Clip, outPath: string): Promise<void> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: clip.text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`elevenlabs ${res.status} on "${clip.key}": ${detail}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  console.log(`  ✓ ${clip.key}.mp3 (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  // Optional positional args filter to specific clip keys, e.g.
  //   npm run generate-audio -- welcome round-single
  const filterKeys = new Set(process.argv.slice(2));
  const clips = filterKeys.size > 0 ? CLIPS.filter((c) => filterKeys.has(c.key)) : CLIPS;
  if (filterKeys.size > 0 && clips.length === 0) {
    console.error(`No matching clip keys for: ${[...filterKeys].join(', ')}`);
    process.exit(1);
  }
  console.log(`Generating ${clips.length} clips × ${VOICES.length} voices into ${OUT_DIR}\n`);
  for (const voice of VOICES) {
    const dir = join(OUT_DIR, voice.id);
    mkdirSync(dir, { recursive: true });
    console.log(`[${voice.label}]`);
    for (const clip of clips) {
      await generate(voice.voiceId, clip, join(dir, `${clip.key}.mp3`));
    }
    console.log();
  }
  console.log(
    `Done. Commit frontend/public/audio/ so production doesn't need to regenerate.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
