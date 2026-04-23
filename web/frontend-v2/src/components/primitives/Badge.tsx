import type { ReactNode } from 'react';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'danger' | 'warn' | 'info' | 'accent';
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}

const variantClasses = {
  default: 'bg-elev text-text-mut',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warn: 'bg-warn/15 text-warn',
  info: 'bg-info/15 text-info',
  accent: 'bg-accent/15 text-accent',
};

const sizeClasses = {
  sm: 'px-1 py-0.5 text-[9px]',
  md: 'px-1.5 py-0.5 text-[10px]',
};

export function Badge({ variant = 'default', size = 'md', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
}

Badge.displayName = 'Badge';
