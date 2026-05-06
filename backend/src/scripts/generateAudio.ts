import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pre-generated audio clips for the game. Run once to generate, commit the
// resulting MP3 files in frontend/public/audio/, and the runtime never hits
// ElevenLabs again.
//
//   cd backend && npm run generate-audio
//
// You only need ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID set locally to do
// this — production doesn't need them.

type Clip = { key: string; text: string };

const CLIPS: Clip[] = [
  // Round transitions
  { key: 'round-single', text: "Single Jeopardy! Let's see what you've got." },
  { key: 'round-double', text: "Double Jeopardy! The stakes just doubled." },
  { key: 'round-complete', text: "That's the end of the round." },

  // Correct rulings — random variant on each fire
  { key: 'correct-1', text: 'Correct!' },
  { key: 'correct-2', text: 'Nice one.' },
  { key: 'correct-3', text: 'Right on the money.' },

  // Incorrect rulings
  { key: 'incorrect-1', text: "I'm afraid that's wrong." },
  { key: 'incorrect-2', text: 'Ooh, so close.' },
  { key: 'incorrect-3', text: 'Not quite.' },

  // Leader penalty
  { key: 'penalty', text: "That'll cost you." },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../frontend/public/audio');

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;

if (!apiKey || !voiceId) {
  console.error(
    'ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set in backend/.env',
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

async function generate(clip: Clip): Promise<void> {
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
  const path = join(OUT_DIR, `${clip.key}.mp3`);
  writeFileSync(path, buf);
  console.log(`✓ ${clip.key}.mp3 (${(buf.length / 1024).toFixed(1)} KB) — "${clip.text}"`);
}

async function main(): Promise<void> {
  console.log(`Generating ${CLIPS.length} clips into ${OUT_DIR}\n`);
  for (const clip of CLIPS) {
    await generate(clip);
  }
  console.log(
    `\nDone. Commit the mp3 files in frontend/public/audio/ so production doesn't need to regenerate.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
