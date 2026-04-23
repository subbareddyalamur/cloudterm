export type InstanceState =
  | 'running'
  | 'stopped'
  | 'pending'
  | 'stopping'
  | 'shutting-down'
  | 'terminated';

export interface StatusDotProps {
  state: InstanceState | string;
  size?: number;
  className?: string;
}

const stateClass: Record<string, string> = {
  running: 'inst-dot running',
  stopped: 'inst-dot stopped',
  pending: 'inst-dot pending',
  stopping: 'inst-dot pending',
  'shutting-down': 'inst-dot pending',
  terminated: 'inst-dot stopped',
};

export function StatusDot({ state, size = 6, className = '' }: StatusDotProps) {
  const cls = stateClass[state] ?? 'inst-dot stopped';
  return (
    <span
      className={`${cls} ${className} inline-block`}
      style={{ width: size, height: size }}
      aria-label={`State: ${state}`}
    />
  );
}

StatusDot.displayName = 'StatusDot';
