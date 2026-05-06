import { useCallback, useEffect, useState } from 'react';
import { api, type AppSettings } from '../api';

const DEFAULTS: AppSettings = {
  moneyBurningMode: false,
  voice: 'daniel',
  voices: [],
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);

  const refresh = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
    } catch (err) {
      console.warn('failed to fetch settings', err);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { settings, setSettings, refresh };
}
