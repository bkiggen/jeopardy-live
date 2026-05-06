// Canonical voice list. Add a new entry here, run `npm run generate-audio`,
// and commit the resulting mp3s under frontend/public/audio/<id>/.
//
// `id` is the URL slug + the value stored in settings; `voiceId` is the
// ElevenLabs ID; `label` is what shows in the admin selector.

export type VoiceMeta = {
  id: string;
  label: string;
  voiceId: string;
};

export const VOICES: ReadonlyArray<VoiceMeta> = [
  { id: 'daniel', label: 'Daniel', voiceId: 'onwK4e9ZLuTAKqWW03F9' },
  { id: 'brian', label: 'Brian', voiceId: 'nPczCjzI2devNBz1zQrb' },
  { id: 'eric', label: 'Eric', voiceId: 'cjVigY5qzO86Huf0OWal' },
  { id: 'george', label: 'George', voiceId: 'JBFqnCBsd6RMkjVDRZzb' },
  { id: 'sarah', label: 'Sarah', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
] as const;

export const DEFAULT_VOICE_ID = 'daniel';

export function isValidVoiceId(id: unknown): id is string {
  return typeof id === 'string' && VOICES.some((v) => v.id === id);
}

export function publicVoices(): Array<{ id: string; label: string }> {
  return VOICES.map((v) => ({ id: v.id, label: v.label }));
}
