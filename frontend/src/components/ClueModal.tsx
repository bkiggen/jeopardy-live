type Props = {
  question: string;
  answer: string;
  revealed: boolean;
  onRevealAnswer: () => void;
  onClose: () => void;
};

export function ClueModal({ question, answer, revealed, onRevealAnswer, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
      <div className="bg-jeopardy-navy rounded-lg p-8 max-w-2xl w-full">
        <p className="text-jeopardy-cream text-2xl mb-6">{question}</p>
        {revealed && <p className="text-jeopardy-gold text-xl mb-6">{answer}</p>}
        <div className="flex gap-2 justify-end">
          {!revealed && (
            <button
              type="button"
              onClick={onRevealAnswer}
              className="px-4 py-2 bg-jeopardy-gold text-jeopardy-navy-deep rounded font-bold"
            >
              Reveal Answer
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
