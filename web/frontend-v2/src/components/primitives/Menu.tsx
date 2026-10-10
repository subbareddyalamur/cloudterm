import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuSection {
  heading?: string;
  items: MenuItem[];
}

export interface MenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  sections: MenuSection[];
  align?: 'left' | 'right';
  triggerClassName?: string;
  /** Extra content rendered below the sections, e.g. a select. */
  footer?: ReactNode;
}

/** Click-to-open menu. Escape and outside click close it; arrow keys move between items. */
export function Menu({ label, trigger, sections, align = 'right', triggerClassName = '', footer }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') ?? []);
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not([disabled])')?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          className={`absolute top-full mt-1 z-[300] min-w-[200px] rounded-lg shadow-lg bg-surface border border-border p-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {sections.map((section, i) => (
            <div key={section.heading ?? i} className={i > 0 ? 'border-t border-border mt-1 pt-1' : ''}>
              {section.heading && (
                <div className="px-3 pt-1 pb-0.5 text-[10px] tracking-wider uppercase text-text-dim">{section.heading}</div>
              )}
              {section.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`w-full flex items-center gap-3 px-2.5 h-7 rounded-md text-left text-[12px] hover:bg-elev focus:bg-elev focus:outline-none disabled:opacity-40 ${item.danger ? 'text-danger' : 'text-text-pri'}`}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-[10px] font-mono text-text-dim">{item.hint}</span>}
                </button>
              ))}
            </div>
          ))}
          {footer && <div className="border-t border-border mt-1 pt-2 pb-1 px-3">{footer}</div>}
        </div>
      )}
    </div>
  );
}
