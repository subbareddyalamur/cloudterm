import { useState, useEffect, useCallback } from "react";
import { Trash2, RefreshCw, Loader2, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { vaultList, vaultDelete } from "@/lib/api";
import type { VaultEntry } from "@/types";

/** Color-coded type badge mapping. */
const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  instance:    { bg: "bg-blue-500/15",   text: "text-blue-400",   label: "Instance" },
  substring:   { bg: "bg-green-500/15",  text: "text-green-400",  label: "Name" },
  pattern:     { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "Pattern" },
  environment: { bg: "bg-orange-500/15", text: "text-orange-400", label: "Environment" },
  account:     { bg: "bg-purple-500/15", text: "text-purple-400", label: "Account" },
  global:      { bg: "bg-zinc-500/15",   text: "text-zinc-400",   label: "Global" },
};

/** Match hierarchy from most to least specific. */
const MATCH_HIERARCHY = [
  { type: "instance",    description: "Exact instance ID match" },
  { type: "substring",   description: "Instance name contains value" },
  { type: "pattern",     description: "Glob pattern on instance name" },
  { type: "environment", description: "Environment tag match" },
  { type: "account",     description: "AWS account ID match" },
  { type: "global",      description: "Matches all instances" },
];

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? { bg: "bg-zinc-500/15", text: "text-zinc-400", label: type };
  return (
    <Badge variant="outline" className={`${style.bg} ${style.text} border-transparent text-[10px]`}>
      {style.label}
    </Badge>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function VaultManager() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showHierarchy, setShowHierarchy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await vaultList();
      setEntries(list ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (id: string) => {
    try {
      await vaultDelete({ id });
      setConfirmDelete(null);
      await refresh();
    } catch {
      // silently fail
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Credential Vault
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowHierarchy((v) => !v)}
            title="Match hierarchy"
          >
            <Info className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={refresh} title="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Manage saved credentials for RDP and SSH connections. Credentials are
        matched to instances using a priority hierarchy — more specific rules
        take precedence.
      </p>

      {/* Match hierarchy panel */}
      {showHierarchy && (
        <div className="rounded border border-border bg-[var(--s1)] p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">
            Match Precedence (highest → lowest)
          </p>
          <ol className="space-y-1">
            {MATCH_HIERARCHY.map((h, i) => (
              <li key={h.type} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right text-muted-foreground">{i + 1}.</span>
                <TypeBadge type={h.type} />
                <span className="text-muted-foreground">{h.description}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Credential list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <ShieldCheck className="size-8 opacity-40" />
          <p className="text-xs">No saved credentials.</p>
          <p className="text-[10px] opacity-70">
            Save credentials when connecting via RDP to populate this list.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.rule.id}
              className="flex items-center gap-3 rounded bg-[var(--s2)] px-3 py-2"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.rule.label || entry.rule.value}
                  </p>
                  <TypeBadge type={entry.rule.type} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {entry.credential.username}
                  {entry.credential.domain ? ` · ${entry.credential.domain}` : ""}
                  {entry.rule.type !== "global" && (
                    <> · <span className="opacity-70">{entry.rule.value}</span></>
                  )}
                  {entry.created_at && (
                    <> · {formatDate(entry.created_at)}</>
                  )}
                </p>
              </div>
              {confirmDelete === entry.rule.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleDelete(entry.rule.id)}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setConfirmDelete(entry.rule.id)}
                  title="Delete credential"
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-red-400" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
