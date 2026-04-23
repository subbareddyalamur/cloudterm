import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import { usePaletteStore } from '@/stores/palette';
import { useInstancesStore } from '@/stores/instances';
import { useSessionsStore } from '@/stores/sessions';
import { buildPaletteGroups } from '@/lib/palette-providers';
import type { PaletteItem } from '@/lib/palette-providers';
import { getAllInstances, getFilteredAccounts } from '@/lib/filter';
import { PaletteRow } from './PaletteRow';

export function CmdKPalette() {
  const open = usePaletteStore((s) => s.open);
  const query = usePaletteStore((s) => s.query);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const setOpen = usePaletteStore((s) => s.setOpen);

  const accounts = useInstancesStore((s) => s.accounts);
  const sessions = useSessionsStore((s) => s.sessions);

  const instances = useMemo(
    () => getAllInstances(getFilteredAccounts(accounts, query)),
    [accounts, query],
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = buildPaletteGroups(query, {
    instances,
    favoriteIds: [],
    recentSessions: sessions.map((s) => ({ id: s.id, instanceName: s.instanceName, type: s.type, createdAt: s.createdAt })),
    onSSH: () => setOpen(false),
    onRDP: () => setOpen(false),
    onOpenSettings: () => setOpen(false),
    onToggleAI: () => setOpen(false),
    onCycleTheme: () => setOpen(false),
  });

  const allItems: PaletteItem[] = groups.flatMap((g) => g.items);

  const clampedIdx = allItems.length > 0 ? Math.min(activeIdx, allItems.length - 1) : 0;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (allItems[clampedIdx]) {
            allItems[clampedIdx].action();
            setOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [allItems, clampedIdx, setOpen],
  );

  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[600px] rounded-lg border border-border shadow-2xl overflow-hidden"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-dim shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type instance name, command, or snippet…"
            className="flex-1 bg-transparent text-[13px] text-text-pri placeholder:text-text-dim outline-none"
            aria-label="Search commands and instances"
          />
          {query && (
            <button
              type="button"
              className="text-[10px] text-text-dim hover:text-text-pri px-1.5 py-0.5 rounded border border-border"
              onClick={() => setQuery('')}
            >
              clear
            </button>
          )}
          <kbd className="text-[10px] text-text-dim px-1.5 py-0.5 rounded border border-border font-mono">esc</kbd>
        </div>

        <div ref={listRef} role="listbox" className="max-h-[400px] overflow-y-auto py-1" aria-label="Results">
          {groups.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-text-dim">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {groups.map((group) => {
            const groupStart = runningIdx;
            runningIdx += group.items.length;
            return (
              <div key={group.label}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-dim">
                  {group.label}
                </div>
                {group.items.map((item, localIdx) => {
                  const globalIdx = groupStart + localIdx;
                  return (
                    <PaletteRow
                      key={item.id}
                      item={item}
                      active={globalIdx === clampedIdx}
                      onActivate={() => {
                        item.action();
                        setOpen(false);
                      }}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-text-dim">
          <span>↑↓ navigate</span>
          <span>↵ SSH</span>
          <span>⌘↵ quick-connect</span>
          <span>esc close</span>
          <span className="ml-auto">space-separated tokens AND-match</span>
        </div>
      </div>
    </div>
  );
}
