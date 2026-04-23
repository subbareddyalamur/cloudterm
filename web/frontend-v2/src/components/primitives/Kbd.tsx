import type { ReactNode } from 'react';

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

export function Kbd({ children, className = '' }: KbdProps) {
  return <kbd className={`kbd ${className}`}>{children}</kbd>;
}

Kbd.displayName = 'Kbd';
