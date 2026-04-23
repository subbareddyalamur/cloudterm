import { CheckCircle, AlertTriangle, Info, XCircle, X, ExternalLink } from 'lucide-react';
import { useToastStore, type Toast } from '@/stores/toast';

const variantConfig = {
  info: { icon: Info, border: 'border-info', text: 'text-info', bg: 'bg-info/10' },
  success: { icon: CheckCircle, border: 'border-success', text: 'text-success', bg: 'bg-success/10' },
  warn: { icon: AlertTriangle, border: 'border-warn', text: 'text-warn', bg: 'bg-warn/10' },
  danger: { icon: XCircle, border: 'border-danger', text: 'text-danger', bg: 'bg-danger/10' },
  progress: { icon: Info, border: 'border-accent', text: 'text-accent', bg: 'bg-accent/10' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const config = variantConfig[toast.variant];
  const Icon = config.icon;

  return (
    <div
      className={`relative flex items-start gap-3 p-3 rounded border ${config.border} ${config.bg} bg-surface shadow-lg`}
      role={toast.variant === 'danger' ? 'alert' : 'status'}
      aria-live={toast.variant === 'danger' ? 'assertive' : 'polite'}
    >
      <Icon size={16} className={`${config.text} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-pri">{toast.title}</p>
        {toast.description && (
          <p className="text-[12px] text-text-mut mt-0.5">{toast.description}</p>
        )}
        {toast.variant === 'progress' && toast.progress !== undefined && (
          <div className="h-0.5 mt-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${Math.round(toast.progress ?? 0)}%` }}
            />
          </div>
        )}
        {toast.link && (
          <a
            href={toast.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
          >
            <ExternalLink size={10} className="shrink-0" />
            {toast.link.label}
          </a>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
            className="mt-2 text-[11px] font-medium text-accent hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="text-text-dim hover:text-text-pri shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const visible = toasts.slice(0, 5);

  return (
    <div className="fixed right-6 bottom-6 z-[100] w-[360px] flex flex-col gap-2 max-h-[440px] scrollbar-none">
      {visible.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

ToastViewport.displayName = 'ToastViewport';
