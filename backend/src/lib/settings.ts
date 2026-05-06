export type Settings = {
  moneyBurningMode: boolean;
};

let current: Settings = {
  moneyBurningMode: false,
};

export function getSettings(): Settings {
  return { ...current };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  if (typeof patch.moneyBurningMode === 'boolean') {
    current.moneyBurningMode = patch.moneyBurningMode;
  }
  return getSettings();
}

// For tests
export function resetSettings(): void {
  current = { moneyBurningMode: false };
}
