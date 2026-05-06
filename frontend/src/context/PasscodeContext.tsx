import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  getPasscode,
  setPasscode as persistPasscode,
  clearPasscode as removePasscode,
  PasscodeRequiredError,
} from '../api';
import { PasscodeModal } from '../components/PasscodeModal';

type PromptOptions = { message?: string };

type PasscodeContextValue = {
  hasPasscode: () => boolean;
  ensurePasscode: (opts?: PromptOptions) => Promise<boolean>;
  callProtected: <T>(
    fn: () => Promise<T>,
    opts?: PromptOptions,
  ) => Promise<T | null>;
  clear: () => void;
};

const PasscodeContext = createContext<PasscodeContextValue | null>(null);

type PendingPrompt = {
  message?: string;
  resolve: (value: boolean) => void;
};

export function PasscodeProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const hasPasscode = useCallback(() => Boolean(getPasscode()), []);

  const ensurePasscode = useCallback(
    (opts?: PromptOptions) =>
      new Promise<boolean>((resolve) => {
        if (getPasscode()) {
          resolve(true);
          return;
        }
        setPending({ message: opts?.message, resolve });
      }),
    [],
  );

  const callProtected = useCallback(
    async <T,>(fn: () => Promise<T>, opts?: PromptOptions): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof PasscodeRequiredError)) throw err;
        const ok = await new Promise<boolean>((resolve) => {
          setPending({ message: opts?.message, resolve });
        });
        if (!ok) return null;
        return await fn();
      }
    },
    [],
  );

  const clear = useCallback(() => removePasscode(), []);

  function handleSubmit(value: string) {
    persistPasscode(value);
    pending?.resolve(true);
    setPending(null);
  }

  function handleCancel() {
    pending?.resolve(false);
    setPending(null);
  }

  return (
    <PasscodeContext.Provider value={{ hasPasscode, ensurePasscode, callProtected, clear }}>
      {children}
      {pending && (
        <PasscodeModal
          message={pending.message}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}
    </PasscodeContext.Provider>
  );
}

export function usePasscode(): PasscodeContextValue {
  const ctx = useContext(PasscodeContext);
  if (!ctx) throw new Error('usePasscode must be used inside PasscodeProvider');
  return ctx;
}
