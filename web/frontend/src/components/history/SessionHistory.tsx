import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  History,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auditLog } from "@/lib/api";
import type { AuditEvent } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const ACTION_TYPES = [
  "all",
  "session_start",
  "session_end",
  "file_upload",
  "file_download",
  "broadcast_command",
] as const;

type ActionFilter = (typeof ACTION_TYPES)[number];

const ACTION_LABELS: Record<string, string> = {
  all: "All actions",
  session_start: "Connect",
  session_end: "Disconnect",
  file_upload: "Upload",
  file_download: "Download",
  broadcast_command: "Broadcast",
};

const ACTION_COLORS: Record<string, string> = {
  session_start: "text-green-500",
  session_end: "text-muted-foreground",
  file_upload: "text-orange-500",
  file_download: "text-blue-500",
  broadcast_command: "text-purple-500",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtAction(action: string): string {
  return action.replace(/_/g, " ");
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function actionColor(action: string): string {
  return ACTION_COLORS[action] ?? "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionHistory({ open, onOpenChange }: SessionHistoryProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const offsetRef = useRef(0);

  // -- Fetch ------------------------------------------------------------------

  const fetchEvents = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    try {
      const offset = reset ? 0 : offsetRef.current;
      const data = await auditLog(PAGE_SIZE, offset);
      if (reset) {
        setEvents(data ?? []);
      } else {
        setEvents((prev) => [...prev, ...(data ?? [])]);
      }
      const received = data?.length ?? 0;
      offsetRef.current = offset + received;
      setHasMore(received >= PAGE_SIZE);
    } catch {
      if (reset) setEvents([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setFilter("all");
      fetchEvents(true);
    }
  }, [open, fetchEvents]);

  // -- Filtered + searched events ---------------------------------------------

  const filtered = useMemo(() => {
    let result = events;
    if (filter !== "all") {
      result = result.filter((e) => e.action === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.action && fmtAction(e.action).toLowerCase().includes(q)) ||
          (e.instance_name && e.instance_name.toLowerCase().includes(q)) ||
          (e.instance_id && e.instance_id.toLowerCase().includes(q)) ||
          (e.details && e.details.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [events, filter, search]);

  // -- Copy details -----------------------------------------------------------

  const handleCopy = async (event: AuditEvent, idx: number) => {
    const text = JSON.stringify(event, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  // -- Render -----------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Session History
          </DialogTitle>
          <DialogDescription>
            Searchable audit log of session events.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar: search + filter + refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as ActionFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ACTION_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            title="Refresh"
            onClick={() => fetchEvents(true)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Event list */}
        <ScrollArea className="max-h-[450px]">
          {loading ? (
            <LoadingSkeleton />
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {events.length === 0
                ? "No events recorded yet"
                : "No events match your search"}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((ev, i) => (
                <div
                  key={`${ev.timestamp}-${ev.action}-${i}`}
                  className="flex items-start gap-3 rounded px-2 py-2 text-sm hover:bg-muted/50"
                >
                  {/* Timestamp */}
                  <span className="shrink-0 w-[150px] text-xs text-muted-foreground tabular-nums pt-0.5">
                    {fmtTime(ev.timestamp)}
                  </span>

                  {/* Action badge */}
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] uppercase ${actionColor(ev.action)}`}
                  >
                    {fmtAction(ev.action)}
                  </Badge>

                  {/* Instance */}
                  <span className="shrink-0 w-[120px] truncate text-xs font-medium pt-0.5">
                    {ev.instance_name || ev.instance_id || "—"}
                  </span>

                  {/* Details */}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground pt-0.5">
                    {ev.details || "—"}
                  </span>

                  {/* Copy button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    title="Copy event details"
                    onClick={() => handleCopy(ev, i)}
                  >
                    {copiedIdx === i ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-3 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => fetchEvents(false)}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-2 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2">
          <div className="h-3 w-[150px] animate-pulse rounded bg-muted" />
          <div className="h-5 w-[70px] animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-[120px] animate-pulse rounded bg-muted" />
          <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
