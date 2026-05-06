import { DEFAULT_VOICE_ID, isValidVoiceId } from './voices.js';

export type Settings = {
  moneyBurningMode: boolean;
  voice: string;
};

let current: Settings = {
  moneyBurningMode: false,
  voice: DEFAULT_VOICE_ID,
};

export function getSettings(): Settings {
  return { ...current };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  if (typeof patch.moneyBurningMode === 'boolean') {
    current.moneyBurningMode = patch.moneyBurningMode;
  }
  if (isValidVoiceId(patch.voice)) {
    current.voice = patch.voice;
  }
  return getSettings();
}

// For tests
export function resetSettings(): void {
  current = { moneyBurningMode: false, voice: DEFAULT_VOICE_ID };
}
