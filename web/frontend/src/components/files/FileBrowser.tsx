import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Download,
  File,
  Folder,
  Loader2,
  Upload,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTransferStore } from "@/stores/useTransferStore";
import {
  browseDirectory,
  downloadFile,
  expressDownload,
  type NDJSONCallback,
} from "@/lib/api";
import type { FileEntry, TransferProgress } from "@/types/transfers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/** Split a path into breadcrumb segments. */
function pathSegments(
  path: string,
  isWindows: boolean,
): { label: string; path: string }[] {
  const sep = /[/\\]/;
  const parts = path.split(sep).filter(Boolean);
  const segments: { label: string; path: string }[] = [];

  if (isWindows) {
    // First part is drive, e.g. "C:"
    let accumulated = "";
    for (const p of parts) {
      accumulated = accumulated ? accumulated + "\\" + p : p;
      segments.push({
        label: p,
        path: segments.length === 0 ? accumulated + "\\" : accumulated,
      });
    }
  } else {
    segments.push({ label: "/", path: "/" });
    let accumulated = "";
    for (const p of parts) {
      accumulated += "/" + p;
      segments.push({ label: p, path: accumulated });
    }
  }

  return segments;
}

/** Compute the parent directory for a path. */
function parentPath(path: string, isWindows: boolean): string | null {
  const root = isWindows ? /^[A-Za-z]:\\?$/ : /^\/$/;
  if (root.test(path)) return null;
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx <= 0) return isWindows ? null : "/";
  const parent = trimmed.slice(0, idx);
  // Ensure Windows drives always end with backslash
  if (isWindows && /^[A-Za-z]:$/.test(parent)) return parent + "\\";
  return parent;
}

function joinPath(
  dir: string,
  name: string,
  isWindows: boolean,
): string {
  const sep = isWindows ? "\\" : "/";
  const base = dir.replace(/[/\\]+$/, "");
  return base + sep + name;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileBrowserProps {
  instanceId: string;
  instanceName: string;
  platform?: string;
  awsProfile?: string;
  awsRegion?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileBrowser({
  instanceId,
  instanceName,
  platform = "linux",
  awsProfile = "",
  awsRegion = "",
}: FileBrowserProps) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);
  const addTransfer = useTransferStore((s) => s.add);
  const updateTransfer = useTransferStore((s) => s.update);

  const isWindows = platform === "windows";
  const open = activeModal === "fileBrowser";

  const [currentPath, setCurrentPath] = useState(() =>
    isWindows ? "C:\\Users" : "/home",
  );
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when opening with a new instance
  useEffect(() => {
    if (open) {
      const start = isWindows ? "C:\\Users" : "/home";
      setCurrentPath(start);
      setEntries([]);
      setError(null);
    }
  }, [open, isWindows]);

  // Fetch directory contents
  const browse = useCallback(
    async (path: string) => {
      setCurrentPath(path);
      setLoading(true);
      setError(null);
      setEntries([]);
      try {
        const result = await browseDirectory({
          instance_id: instanceId,
          path,
          aws_profile: awsProfile,
          aws_region: awsRegion,
        });
        // Sort: directories first, then alphabetically
        result.sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to browse directory";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [instanceId, awsProfile, awsRegion],
  );

  // Browse on open and when currentPath changes via breadcrumb
  useEffect(() => {
    if (open && instanceId) {
      browse(currentPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instanceId]);

  const navigateTo = useCallback(
    (path: string) => {
      browse(path);
    },
    [browse],
  );

  // Download helpers
  const startDownload = useCallback(
    async (remotePath: string, express: boolean) => {
      const filename =
        remotePath.split("/").pop()?.split("\\").pop() || "download";
      const tid = addTransfer("download", filename, express);

      const onProgress: NDJSONCallback<TransferProgress> = (msg) => {
        if (msg.status === "error") {
          updateTransfer(tid, msg.progress ?? 100, msg.message, "error");
        } else if (msg.status === "complete") {
          updateTransfer(tid, 100, "Complete", "complete");
        } else {
          updateTransfer(tid, msg.progress ?? 0, msg.message ?? "", "active");
        }
      };

      try {
        if (express) {
          await expressDownload(
            {
              instance_id: instanceId,
              remote_path: remotePath,
              aws_profile: awsProfile,
              aws_region: awsRegion,
              ...(s3Bucket ? { s3_bucket: s3Bucket } : {}),
            } as Parameters<typeof expressDownload>[0],
            onProgress,
          );
        } else {
          await downloadFile(
            {
              instance_id: instanceId,
              instance_name: instanceName,
              remote_path: remotePath,
              aws_profile: awsProfile,
              aws_region: awsRegion,
            },
            onProgress,
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Download failed";
        updateTransfer(tid, 0, msg, "error");
      }
    },
    [
      instanceId,
      instanceName,
      awsProfile,
      awsRegion,
      s3Bucket,
      addTransfer,
      updateTransfer,
    ],
  );

  const handleUpload = useCallback(() => {
    // Close file browser and open upload modal pre-filled with the current path
    closeModal();
    // Small delay so the upload modal opens cleanly
    setTimeout(() => openModal("upload"), 50);
  }, [closeModal, openModal]);

  const handleOpenChange = (next: boolean) => {
    if (!next) closeModal();
  };

  const parent = parentPath(currentPath, isWindows);
  const segments = pathSegments(currentPath, isWindows);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-0 pb-3">
          <DialogTitle className="text-sm">
            Browse Files —{" "}
            <span className="font-normal text-muted-foreground">
              {instanceName} ({instanceId})
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Breadcrumb + Upload button */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-xs">
            {segments.map((seg, i) => (
              <span key={seg.path} className="flex items-center gap-0.5">
                {i > 0 && (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                )}
                <button
                  className="rounded px-1 py-0.5 hover:bg-accent hover:text-accent-foreground"
                  onClick={() => navigateTo(seg.path)}
                >
                  {seg.label}
                </button>
              </span>
            ))}
          </nav>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 text-xs"
            onClick={handleUpload}
          >
            <Upload className="size-3" />
            Upload
          </Button>
        </div>

        {/* Content area */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Empty directory
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-6 py-1.5" />
                  <th className="py-1.5 font-medium">Name</th>
                  <th className="w-20 py-1.5 text-right font-medium">Size</th>
                  <th className="w-28 py-1.5 font-medium">Modified</th>
                  <th className="w-20 py-1.5 font-medium">Perms</th>
                  <th className="w-16 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {/* Parent directory row */}
                {parent !== null && (
                  <tr
                    className="cursor-pointer border-b border-border/50 hover:bg-accent/50"
                    onClick={() => navigateTo(parent)}
                  >
                    <td className="py-1.5 text-center">
                      <Folder className="inline size-3.5 text-amber-400" />
                    </td>
                    <td className="py-1.5 font-medium">..</td>
                    <td />
                    <td />
                    <td />
                    <td />
                  </tr>
                )}
                {entries.map((entry) => {
                  const fullPath = joinPath(
                    currentPath,
                    entry.name,
                    isWindows,
                  );
                  return (
                    <tr
                      key={entry.name}
                      className="cursor-pointer border-b border-border/50 hover:bg-accent/50"
                      onClick={() => {
                        if (entry.is_dir) navigateTo(fullPath);
                      }}
                    >
                      <td className="py-1.5 text-center">
                        {entry.is_dir ? (
                          <Folder className="inline size-3.5 text-amber-400" />
                        ) : (
                          <File className="inline size-3.5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="max-w-[200px] truncate py-1.5 font-medium">
                        {entry.name}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {entry.is_dir ? "" : formatSize(entry.size)}
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        {entry.modified ?? ""}
                      </td>
                      <td className="py-1.5 font-mono text-muted-foreground">
                        {entry.permissions ?? ""}
                      </td>
                      <td className="py-1.5">
                        {!entry.is_dir && (
                          <span className="flex gap-1">
                            <button
                              className="text-muted-foreground hover:text-foreground"
                              title="Download"
                              onClick={(e) => {
                                e.stopPropagation();
                                startDownload(fullPath, false);
                              }}
                            >
                              <Download className="size-3.5" />
                            </button>
                            {s3Bucket && (
                              <button
                                className="text-amber-400 hover:text-amber-300"
                                title="Express Download"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startDownload(fullPath, true);
                                }}
                              >
                                <Zap className="size-3.5" />
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
