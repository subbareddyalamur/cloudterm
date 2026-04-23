import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leftIcon, rightIcon, error, className = '', ...rest },
  ref,
) {
  return (
    <div className="relative flex flex-col gap-1">
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-2 text-text-dim pointer-events-none flex items-center">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={[
            'w-full bg-elev border border-border rounded text-text-pri',
            'text-[var(--base-size,13px)] leading-tight',
            'placeholder:text-text-dim',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
            'transition-colors duration-120',
            'h-7',
            leftIcon ? 'pl-7' : 'pl-2.5',
            rightIcon ? 'pr-7' : 'pr-2.5',
            error ? 'border-danger' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute right-2 text-text-dim pointer-events-none flex items-center">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
});

Input.displayName = 'Input';
