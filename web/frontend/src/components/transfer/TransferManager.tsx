import { useMemo } from "react";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTransferStore,
  type Transfer,
  type TransferStatus,
} from "@/stores/useTransferStore";

/** Single progress row inside the transfer panel. */
function TransferRow({ transfer }: { transfer: Transfer }) {
  const remove = useTransferStore((s) => s.remove);
  const isDone = transfer.status === "complete";
  const isError = transfer.status === "error";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded px-2 py-1.5 text-xs",
        isDone && "opacity-60",
        isError && "bg-destructive/10"
      )}
    >
      {/* Top row: icon + name + pct + dismiss */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0">
          {transfer.type === "upload" ? (
            <ArrowUp className="size-3 text-green-400" />
          ) : (
            <ArrowDown className="size-3 text-blue-400" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {transfer.name}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {isDone ? (
            <Check className="inline size-3 text-green-400" />
          ) : isError ? (
            <AlertTriangle className="inline size-3 text-destructive" />
          ) : (
            `${transfer.progress}%`
          )}
        </span>
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Dismiss"
          onClick={() => remove(transfer.id)}
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            statusColor(transfer.status)
          )}
          style={{ width: `${transfer.progress}%` }}
        />
      </div>

      {/* Status message */}
      {transfer.message && (
        <span className="truncate text-[10px] text-muted-foreground">
          {transfer.message}
        </span>
      )}
    </div>
  );
}

function statusColor(status: TransferStatus): string {
  switch (status) {
    case "complete":
      return "bg-green-500";
    case "error":
      return "bg-destructive";
    default:
      return "bg-primary";
  }
}

/** Google Drive-style floating transfer panel. */
export function TransferManager() {
  const transfers = useTransferStore((s) => s.transfers);
  const collapsed = useTransferStore((s) => s.collapsed);
  const toggleCollapsed = useTransferStore((s) => s.toggleCollapsed);
  const clearCompleted = useTransferStore((s) => s.clearCompleted);

  const items = useMemo(() => [...transfers.values()], [transfers]);

  if (items.length === 0) return null;

  // Derive title
  const types = new Set(items.map((t) => t.type));
  const title =
    types.size === 1
      ? types.has("upload")
        ? "Uploads"
        : "Downloads"
      : "Transfers";

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 overflow-hidden rounded-lg border border-border bg-[var(--s1)] shadow-xl">
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/50"
        onClick={toggleCollapsed}
      >
        <span className="flex-1">
          {title}{" "}
          <span className="text-muted-foreground">({items.length})</span>
        </span>
        <span
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Clear completed"
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            clearCompleted();
          }}
        >
          <X className="size-3.5" />
        </span>
        <Minus
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            collapsed && "rotate-180"
          )}
        />
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="max-h-60 overflow-y-auto p-1">
          {items.map((t) => (
            <TransferRow key={t.id} transfer={t} />
          ))}
        </div>
      )}
    </div>
  );
}
