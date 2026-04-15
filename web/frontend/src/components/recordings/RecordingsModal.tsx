import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Play,
  Trash2,
  Download,
  Film,
  Search,
  Loader2,
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
  listRecordings,
  deleteRecording,
  convertRecording,
  convertStatus,
} from "@/lib/api";
import type { Recording } from "@/types";
import { CastPlayer } from "./CastPlayer";
import { GuacPlayer } from "./GuacPlayer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecordingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConvertState = "idle" | "converting" | "done" | "error";

interface ConvertInfo {
  state: ConvertState;
  jobId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecordingsModal({ open, onOpenChange }: RecordingsModalProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [converting, setConverting] = useState<Map<string, ConvertInfo>>(
    new Map(),
  );

  // Player state
  const [playerFile, setPlayerFile] = useState<string | null>(null);
  const [playerType, setPlayerType] = useState<"ssh" | "rdp" | null>(null);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const recs = await listRecordings();
      setRecordings(recs ?? []);
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchRecordings();
      setPlayerFile(null);
      setPlayerType(null);
    }
  }, [open, fetchRecordings]);

  const filtered = useMemo(() => {
    if (!search) return recordings;
    const q = search.toLowerCase();
    return recordings.filter((r) => r.name.toLowerCase().includes(q));
  }, [recordings, search]);

  // -- Actions ----------------------------------------------------------------

  const handlePlay = (rec: Recording) => {
    setPlayerFile(rec.name);
    setPlayerType(rec.type);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete recording "${name}"?`)) return;
    try {
      await deleteRecording(name);
      fetchRecordings();
    } catch {
      /* toast handled by api layer */
    }
  };

  const handleConvert = async (name: string) => {
    setConverting((prev) => {
      const next = new Map(prev);
      next.set(name, { state: "converting" });
      return next;
    });
    try {
      const { job_id } = await convertRecording({ filename: name });
      setConverting((prev) => {
        const next = new Map(prev);
        next.set(name, { state: "converting", jobId: job_id });
        return next;
      });
      pollConversion(name, job_id);
    } catch {
      setConverting((prev) => {
        const next = new Map(prev);
        next.set(name, { state: "error" });
        return next;
      });
    }
  };

  const pollConversion = async (name: string, jobId: string) => {
    try {
      const data = await convertStatus(jobId);
      if (data.status === "done") {
        setConverting((prev) => {
          const next = new Map(prev);
          next.set(name, { state: "done", jobId });
          return next;
        });
        fetchRecordings();
        return;
      }
      if (data.status === "error") {
        setConverting((prev) => {
          const next = new Map(prev);
          next.set(name, { state: "error", jobId });
          return next;
        });
        return;
      }
      setTimeout(() => pollConversion(name, jobId), 3000);
    } catch {
      setTimeout(() => pollConversion(name, jobId), 5000);
    }
  };

  const handleDownloadMp4 = (name: string) => {
    const ext = name.lastIndexOf(".");
    const mp4Name = (ext > 0 ? name.substring(0, ext) : name) + ".mp4";
    const a = document.createElement("a");
    a.href = `/recordings/${encodeURIComponent(mp4Name)}`;
    a.download = mp4Name;
    a.click();
  };

  // -- Player open? -----------------------------------------------------------

  if (playerFile && playerType) {
    if (playerType === "ssh") {
      return (
        <CastPlayer
          filename={playerFile}
          open
          onOpenChange={(v) => {
            if (!v) {
              setPlayerFile(null);
              setPlayerType(null);
            }
          }}
        />
      );
    }
    return (
      <GuacPlayer
        filename={playerFile}
        open
        onOpenChange={(v) => {
          if (!v) {
            setPlayerFile(null);
            setPlayerType(null);
          }
        }}
      />
    );
  }

  // -- Main list modal --------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Session Recordings</DialogTitle>
          <DialogDescription>
            Browse, replay, and manage session recordings.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter recordings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {recordings.length === 0
                ? "No recordings yet"
                : "No recordings match your filter"}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((rec) => {
                const ci = converting.get(rec.name);
                const isConverting = ci?.state === "converting";
                const mp4Ready = rec.has_mp4 || ci?.state === "done";

                return (
                  <div
                    key={rec.name}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    {/* Type badge */}
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] uppercase"
                    >
                      {rec.type}
                    </Badge>

                    {/* Name */}
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {rec.name}
                    </span>

                    {/* Meta */}
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {fmtSize(rec.size)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(rec.mod_time)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Play"
                        onClick={() => handlePlay(rec)}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={
                          mp4Ready
                            ? "MP4 ready"
                            : isConverting
                              ? "Converting…"
                              : "Convert to MP4"
                        }
                        disabled={mp4Ready || isConverting}
                        onClick={() => handleConvert(rec.name)}
                      >
                        {isConverting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Film className="h-3.5 w-3.5" />
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Download MP4"
                        disabled={!mp4Ready}
                        onClick={() => handleDownloadMp4(rec.name)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => handleDelete(rec.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
