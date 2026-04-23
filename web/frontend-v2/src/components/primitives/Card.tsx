import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`bg-surface border border-border rounded p-4 ${className}`}>
      {title && <h3 className="text-[12px] font-semibold text-text-mut uppercase tracking-wide mb-3">{title}</h3>}
      {children}
    </div>
  );
}

Card.displayName = 'Card';
