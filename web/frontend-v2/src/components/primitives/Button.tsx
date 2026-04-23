import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90 active:opacity-80',
  ghost: 'bg-transparent text-text-pri hover:bg-elev',
  outline: 'bg-transparent text-text-pri border border-border hover:bg-elev',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
  subtle: 'bg-surface text-text-pri hover:bg-elev',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconPosition = 'left',
    loading = false,
    fullWidth = false,
    className = '',
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    'inline-flex items-center justify-center rounded font-medium',
    'transition-[background,color,opacity] duration-120',
    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const leftContent = loading ? (
    <Loader2 className="animate-spin" size={14} />
  ) : iconPosition === 'left' ? (
    icon
  ) : null;

  const rightContent = !loading && iconPosition === 'right' ? icon : null;

  return (
    <button ref={ref} className={classes} disabled={disabled ?? loading} {...rest}>
      {leftContent}
      {children}
      {rightContent}
    </button>
  );
});

Button.displayName = 'Button';
