import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { create } from 'zustand';
import type { EC2Instance } from '@/lib/types';
import { useSettingsStore } from '@/stores/settings';
import { useInstancesStore } from '@/stores/instances';
import { CTX_ITEMS, getVisibleEntries, isSeparator } from './contextMenuItems';
import type { CtxItem } from './contextMenuItems';
import { Kbd } from '@/components/primitives/Kbd';

interface CtxMenuStore {
  isOpen: boolean;
  x: number;
  y: number;
  instance: EC2Instance | null;
  show: (args: { x: number; y: number; instance: EC2Instance }) => void;
  hide: () => void;
}

const useCtxMenuStore = create<CtxMenuStore>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  instance: null,
  show: ({ x, y, instance }) => set({ isOpen: true, x, y, instance }),
  hide: () => set({ isOpen: false }),
}));

export function openContextMenu(args: { x: number; y: number; instance: EC2Instance }): void {
  useCtxMenuStore.getState().show(args);
}

function clampPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: x + menuW > vw ? Math.max(0, x - menuW) : x,
    top: y + menuH > vh ? Math.max(0, y - menuH) : y,
  };
}

export const InstanceContextMenu = memo(function InstanceContextMenu() {
  const isOpen = useCtxMenuStore((s) => s.isOpen);
  const rawX = useCtxMenuStore((s) => s.x);
  const rawY = useCtxMenuStore((s) => s.y);
  const instance = useCtxMenuStore((s) => s.instance);
  const hide = useCtxMenuStore((s) => s.hide);
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);
  const toggleFavorite = useInstancesStore((s) => s.toggleFavorite);

  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [pos, setPos] = useState({ left: rawX, top: rawY });

  const settings = useMemo(
    () => ({ s3Bucket: s3Bucket || undefined }),
    [s3Bucket],
  );

  const visibleEntries = useMemo(
    () =>
      isOpen && instance
        ? getVisibleEntries(CTX_ITEMS, instance, settings)
        : [],
    [isOpen, instance, settings],
  );

  const flatItems: CtxItem[] = useMemo(
    () => visibleEntries.filter((e): e is CtxItem => !isSeparator(e)),
    [visibleEntries],
  );

  useEffect(() => {
    if (!isOpen) return;
    setFocusedIdx(0);
    const el = menuRef.current;
    if (el) {
      const { offsetWidth: w, offsetHeight: h } = el;
      setPos(clampPosition(rawX, rawY, w, h));
    }
  }, [isOpen, rawX, rawY]);

  const handleAction = useCallback(
    (item: CtxItem) => {
      if (!instance) return;
      if (item.id === 'favorite') {
        toggleFavorite(instance.instance_id);
      } else {
        item.action(instance);
      }
      hide();
    },
    [instance, toggleFavorite, hide],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hide();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((p) => Math.min(p + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[focusedIdx];
        if (item && !item.disabled?.(instance ?? ({} as EC2Instance))) {
          handleAction(item);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatItems, focusedIdx, instance, hide, handleAction]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hide();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, hide]);

  if (!isOpen || !instance) return null;

  let itemIdx = 0;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Instance actions"
      className="ctx-menu fixed z-[9999] select-none"
      style={{ left: pos.left, top: pos.top }}
    >
      {visibleEntries.map((entry, i) => {
        if (isSeparator(entry)) {
          return <div key={`sep-${i}`} className="ctx-sep" />;
        }

        const item = entry;
        const currentIdx = itemIdx++;
        const isDisabled = !!item.disabled?.(instance);
        const isFocused = focusedIdx === currentIdx;
        const meta = item.meta?.(instance);
        const IconComp = item.icon;

        return (
          <div
            key={item.id}
            role="menuitem"
            aria-disabled={isDisabled}
            tabIndex={-1}
            className={[
              'ctx-item',
              item.danger ? 'danger' : '',
              isDisabled ? 'ctx-dim' : '',
              isFocused && !isDisabled
                ? 'bg-accent/15 text-accent border-l-accent'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ borderLeft: '2px solid transparent' }}
            onMouseEnter={() => setFocusedIdx(currentIdx)}
            onClick={() => {
              if (!isDisabled) handleAction(item);
            }}
          >
            <IconComp
              size={13}
              aria-hidden
              style={{ flexShrink: 0 }}
            />
            <span className="flex-1">{item.label}</span>
            {item.pill && (
              <span
                className={`text-[8.5px] font-bold px-1 py-0.5 rounded ${item.pill.colorClass}`}
              >
                {item.pill.label}
              </span>
            )}
            {meta && <span className="ctx-meta truncate max-w-[100px]">{meta}</span>}
            {item.kbd && <Kbd className="ml-auto">{item.kbd}</Kbd>}
          </div>
        );
      })}
    </div>
  );
});
