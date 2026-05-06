import { useState } from 'react';

type Props = {
  message?: string;
  onSubmit: (passcode: string) => void;
  onCancel: () => void;
};

export function PasscodeModal({ message, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 cursor-pointer"
      onClick={onCancel}
      role="button"
      tabIndex={-1}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
        className="bg-jeopardy-navy rounded-lg w-full max-w-md border-4 border-jeopardy-gold/60 shadow-2xl animate-clue-in p-6 cursor-default flex flex-col gap-4"
      >
        <h2 className="font-display text-jeopardy-gold text-3xl tracking-wider text-shadow-tile">
          HOST PASSCODE
        </h2>
        <p className="text-jeopardy-cream/80 text-sm">
          {message ?? 'This action requires the host passcode.'}
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter passcode"
          className="px-3 py-2 rounded bg-white/10 text-jeopardy-cream placeholder-jeopardy-cream/40 border border-jeopardy-gold/30"
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white/10 text-jeopardy-cream rounded hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-5 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold disabled:opacity-40"
          >
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
