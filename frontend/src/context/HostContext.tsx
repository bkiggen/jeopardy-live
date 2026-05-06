import { createContext, useContext, type ReactNode } from 'react';
import { useHost } from '../hooks/useHost';
import { useSettings } from '../hooks/useSettings';

type HostValue = ReturnType<typeof useHost>;

const HostContext = createContext<HostValue | null>(null);

export function HostProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const host = useHost(settings.voice);
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function useHostContext(): HostValue {
  const ctx = useContext(HostContext);
  if (!ctx) throw new Error('useHostContext must be used inside HostProvider');
  return ctx;
}
