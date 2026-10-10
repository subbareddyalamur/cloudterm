import { useRef, useEffect } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface TerminalSearchProps {
  onNext: (q: string) => void;
  onPrev: (q: string) => void;
  onClose: () => void;
  resultIndex: number;
  resultCount: number;
}

export function TerminalSearch({ onNext, onPrev, onClose, resultIndex, resultCount }: TerminalSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const query = () => inputRef.current?.value ?? '';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev(query());
      else onNext(query());
    } else if (e.key === 'Escape') {
      onClose();
    }
    e.stopPropagation();
  };

  const countLabel = resultCount === 0
    ? 'No results'
    : resultIndex === -1
      ? `${resultCount}+`
      : `${resultIndex + 1} of ${resultCount}`;

  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-surface border border-border rounded-md shadow-lg px-2 py-1.5">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search…"
        className="bg-transparent text-[12px] text-text-pri placeholder:text-text-dim outline-none w-44"
        onKeyDown={handleKeyDown}
        onChange={(e) => onNext(e.target.value)}
      />
      {query().length > 0 && (
        <span className="text-[11px] text-text-dim whitespace-nowrap shrink-0 min-w-[48px] text-right">
          {countLabel}
        </span>
      )}
      <button
        type="button"
        title="Previous match (Shift+Enter)"
        className="text-text-dim hover:text-text-pri transition-colors p-0.5"
        onClick={() => onPrev(query())}
      >
        <ChevronUp size={13} />
      </button>
      <button
        type="button"
        title="Next match (Enter)"
        className="text-text-dim hover:text-text-pri transition-colors p-0.5"
        onClick={() => onNext(query())}
      >
        <ChevronDown size={13} />
      </button>
      <div className="w-px h-3.5 bg-border mx-0.5" />
      <button
        type="button"
        title="Close search"
        className="text-text-dim hover:text-text-pri transition-colors p-0.5"
        onClick={onClose}
      >
        <X size={13} />
      </button>
    </div>
  );
}

TerminalSearch.displayName = 'TerminalSearch';
