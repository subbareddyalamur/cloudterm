import { useState, useMemo, useCallback } from "react";
import {
  Radio,
  CheckCircle2,
  XCircle,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInstanceStore } from "@/stores/useInstanceStore";
import { broadcastCommand } from "@/lib/api";
import type { BroadcastTarget, BroadcastResult } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BroadcastModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a specific instance when opening */
  preselectedId?: string;
}

interface InstanceResult extends BroadcastResult {
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BroadcastModal({
  open,
  onOpenChange,
  preselectedId,
}: BroadcastModalProps) {
  const flatInstances = useInstanceStore((s) => s.flatInstances);

  // Only show running instances
  const runningInstances = useMemo(
    () => flatInstances.filter((i) => i.state === "running"),
    [flatInstances],
  );

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (preselectedId) return new Set([preselectedId]);
    return new Set();
  });
  const [search, setSearch] = useState("");
  const [command, setCommand] = useState("");
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<InstanceResult[] | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(
    new Set(),
  );

  // Reset state when modal opens/closes
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setSelected(new Set());
        setSearch("");
        setCommand("");
        setExecuting(false);
        setResults(null);
        setExpandedResults(new Set());
      } else if (preselectedId) {
        setSelected(new Set([preselectedId]));
      }
      onOpenChange(next);
    },
    [onOpenChange, preselectedId],
  );

  // Filtered instances based on search
  const filtered = useMemo(() => {
    if (!search.trim()) return runningInstances;
    const q = search.toLowerCase();
    return runningInstances.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.instance_id.toLowerCase().includes(q) ||
        i.aws_profile.toLowerCase().includes(q) ||
        i.aws_region.toLowerCase().includes(q),
    );
  }, [runningInstances, search]);

  // Toggle helpers
  const toggleInstance = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of filtered) next.add(i.instance_id);
      return next;
    });
  }, [filtered]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const toggleResultExpanded = useCallback((id: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Execute broadcast
  const execute = useCallback(async () => {
    if (selected.size === 0 || !command.trim()) return;

    const targets: BroadcastTarget[] = runningInstances
      .filter((i) => selected.has(i.instance_id))
      .map((i) => ({
        instance_id: i.instance_id,
        name: i.name,
        profile: i.aws_profile,
        region: i.aws_region,
        platform: i.platform,
      }));

    // Show loading state per-instance
    setResults(
      targets.map((t) => ({
        instance_id: t.instance_id,
        name: t.name,
        output: "",
        success: false,
        loading: true,
      })),
    );
    setExpandedResults(new Set());
    setExecuting(true);

    try {
      const data = await broadcastCommand({ command: command.trim(), targets });
      setResults(data.map((r) => ({ ...r, loading: false })));
      // Auto-expand failed results
      setExpandedResults(
        new Set(data.filter((r) => !r.success).map((r) => r.instance_id)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setResults(
        targets.map((t) => ({
          instance_id: t.instance_id,
          name: t.name,
          output: "",
          error: msg,
          success: false,
          loading: false,
        })),
      );
      setExpandedResults(new Set(targets.map((t) => t.instance_id)));
    } finally {
      setExecuting(false);
    }
  }, [selected, command, runningInstances]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="size-5" />
            Broadcast Command
          </DialogTitle>
          <DialogDescription>
            Execute a command across multiple instances simultaneously.
          </DialogDescription>
        </DialogHeader>

        {/* Instance selection */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Instances{" "}
              <span className="text-muted-foreground">
                ({selected.size} selected)
              </span>
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="xs" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Filter instances…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          <ScrollArea className="h-48 rounded-md border">
            <div className="p-1">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {runningInstances.length === 0
                    ? "No running instances"
                    : "No instances match filter"}
                </div>
              ) : (
                filtered.map((inst) => (
                  <label
                    key={inst.instance_id}
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(inst.instance_id)}
                      onChange={() => toggleInstance(inst.instance_id)}
                      className="rounded border-input"
                    />
                    <span className="truncate font-medium flex-1">
                      {inst.name || inst.instance_id}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {inst.instance_id}
                    </span>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Command input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="bc-command">
            Command
          </label>
          <textarea
            id="bc-command"
            className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none resize-y font-mono dark:bg-input/30"
            placeholder="Enter command to execute…"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                execute();
              }
            }}
          />
          <span className="text-xs text-muted-foreground">
            Press Ctrl+Enter to execute
          </span>
        </div>

        {/* Results */}
        {results && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Results</span>
            <ScrollArea className="max-h-48 rounded-md border">
              <div className="p-1 space-y-1">
                {results.map((r) => (
                  <div
                    key={r.instance_id}
                    className="rounded-md border bg-muted/30"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-left"
                      onClick={() => toggleResultExpanded(r.instance_id)}
                    >
                      {r.loading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                      ) : expandedResults.has(r.instance_id) ? (
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate flex-1 font-medium">
                        {r.name || r.instance_id}
                      </span>
                      {r.loading ? (
                        <Badge variant="secondary" className="shrink-0">
                          Running…
                        </Badge>
                      ) : r.success ? (
                        <Badge className="shrink-0 bg-green-600 text-white border-transparent">
                          <CheckCircle2 className="size-3" />
                          OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="shrink-0">
                          <XCircle className="size-3" />
                          Error
                        </Badge>
                      )}
                    </button>
                    {!r.loading && expandedResults.has(r.instance_id) && (
                      <pre className="mx-2 mb-2 max-h-32 overflow-auto rounded bg-background p-2 text-xs font-mono whitespace-pre-wrap">
                        {r.success
                          ? r.output || "(no output)"
                          : r.error || "(no output)"}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
          <Button
            onClick={execute}
            disabled={executing || selected.size === 0 || !command.trim()}
          >
            {executing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Executing…
              </>
            ) : (
              <>
                <Radio className="size-4" />
                Execute ({selected.size})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
