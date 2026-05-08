import { prisma } from '../prisma.js';
import { DEFAULT_VOICE_ID, isValidVoiceId } from './voices.js';

export type Settings = {
  moneyBurningMode: boolean;
  voice: string;
  buzzAnswerSeconds: number;
  finalAnswerSeconds: number;
};

const DEFAULT_BUZZ_ANSWER_SECONDS = 10;
const DEFAULT_FINAL_ANSWER_SECONDS = 30;
const MIN_TIMER_SECONDS = 3;
const MAX_TIMER_SECONDS = 300;
const SINGLETON_ID = 1;

const DEFAULTS: Settings = {
  moneyBurningMode: false,
  voice: DEFAULT_VOICE_ID,
  buzzAnswerSeconds: DEFAULT_BUZZ_ANSWER_SECONDS,
  finalAnswerSeconds: DEFAULT_FINAL_ANSWER_SECONDS,
};

function clampTimer(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const i = Math.round(value);
  if (i < MIN_TIMER_SECONDS || i > MAX_TIMER_SECONDS) return null;
  return i;
}

// In-memory cache, kept in sync with the singleton row in `app_settings`. The
// rest of the app reads this synchronously (e.g. socket timers); we hydrate it
// at boot via initSettings() and write through on every update.
let current: Settings = { ...DEFAULTS };

export async function initSettings(): Promise<void> {
  const row = await prisma.appSetting.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  current = {
    moneyBurningMode: row.moneyBurningMode,
    voice: isValidVoiceId(row.voice) ? row.voice : DEFAULT_VOICE_ID,
    buzzAnswerSeconds:
      clampTimer(row.buzzAnswerSeconds) ?? DEFAULT_BUZZ_ANSWER_SECONDS,
    finalAnswerSeconds:
      clampTimer(row.finalAnswerSeconds) ?? DEFAULT_FINAL_ANSWER_SECONDS,
  };
}

export function getSettings(): Settings {
  return { ...current };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next: Settings = { ...current };
  if (typeof patch.moneyBurningMode === 'boolean') {
    next.moneyBurningMode = patch.moneyBurningMode;
  }
  if (isValidVoiceId(patch.voice)) {
    next.voice = patch.voice;
  }
  const buzz = clampTimer(patch.buzzAnswerSeconds);
  if (buzz !== null) next.buzzAnswerSeconds = buzz;
  const finalSec = clampTimer(patch.finalAnswerSeconds);
  if (finalSec !== null) next.finalAnswerSeconds = finalSec;

  await prisma.appSetting.upsert({
    where: { id: SINGLETON_ID },
    update: next,
    create: { id: SINGLETON_ID, ...next },
  });
  current = next;
  return getSettings();
}

// For tests
export function resetSettings(): void {
  current = { ...DEFAULTS };
}
