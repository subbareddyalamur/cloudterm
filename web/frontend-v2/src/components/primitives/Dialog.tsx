import { type ReactNode, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onOpenChange, title, size = 'md', children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<Element | null>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Capture focus origin so we can restore it on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      // Auto-focus first focusable element inside panel
      requestAnimationFrame(() => {
        const first = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
        first?.focus();
      });
    } else {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    }
  }, [open]);

  // Focus trap + Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  // Prevent body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', animation: 'dialog-fade-in 150ms ease' }}
      onClick={close}
    >
      <style>{`
        @keyframes dialog-fade-in { from { opacity:0 } to { opacity:1 } }
        @keyframes dialog-slide-in { from { opacity:0; transform:scale(0.97) translateY(6px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes dialog-fade-in { from { opacity:1 } }
          @keyframes dialog-slide-in { from { opacity:1; transform:none } }
        }
      `}</style>
      <div
        ref={panelRef}
        className={`${sizeMap[size]} w-full rounded-lg border border-border bg-surface text-text-pri shadow-2xl flex flex-col max-h-[90vh]`}
        style={{ animation: 'dialog-slide-in 180ms ease' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-[14px] font-semibold text-text-pri" id="dialog-title">{title}</h2>
          <button
            type="button"
            className="text-text-dim hover:text-text-pri transition-colors rounded p-1 -mr-1 focus-visible:outline-2 focus-visible:outline-accent"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

Dialog.displayName = 'Dialog';
