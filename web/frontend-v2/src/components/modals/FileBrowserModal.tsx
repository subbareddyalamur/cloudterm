import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronRight, Folder, FileIcon, Upload, Download, Home, ArrowLeft } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toast';
import { useSettingsStore } from '@/stores/settings';

export interface FileBrowserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName?: string;
  awsProfile?: string;
  awsRegion?: string;
  platform?: string;
  onUpload?: (path: string) => void;
  onDownload?: (path: string) => void;
  onExpressDownload?: (path: string) => void;
}

interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
  permissions?: string;
}

// Shape returned by the Go backend
interface BackendFileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified: string;
  permissions?: string;
}

function normalize(e: BackendFileEntry): DirEntry {
  return {
    name: e.name,
    isDir: e.is_dir,
    size: e.size,
    modified: e.modified,
    permissions: e.permissions,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts: string): string {
  if (!ts) return '—';
  // Try standard date parse first
  const d = new Date(ts);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  // Return as-is if unparseable (e.g. "Jan 20 2026" from ls -la)
  return ts;
}

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error ?? raw;
  } catch {
    return raw;
  }
}

function isWindows(platform: string): boolean {
  return platform.toLowerCase() === 'windows';
}

function rootPath(platform: string): string {
  return isWindows(platform) ? 'C:\\' : '/';
}

function joinPath(dir: string, name: string, win: boolean): string {
  const sep = win ? '\\' : '/';
  const base = dir.replace(/[/\\]+$/, '');
  return base + sep + name;
}

function parentPath(path: string, win: boolean): string | null {
  const rootRe = win ? /^[A-Za-z]:\\?$/ : /^\/$/;
  if (rootRe.test(path)) return null;
  const trimmed = path.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (idx <= 0) return win ? null : '/';
  const parent = trimmed.slice(0, idx) || (win ? null : '/');
  if (win && parent && /^[A-Za-z]:$/.test(parent)) return parent + '\\';
  return parent;
}

function breadcrumbSegments(path: string, win: boolean): { label: string; path: string }[] {
  if (win) {
    const parts = path.split(/[/\\]/).filter(Boolean);
    const segs: { label: string; path: string }[] = [];
    let acc = '';
    for (const p of parts) {
      acc = acc ? acc + '\\' + p : p;
      segs.push({ label: p, path: segs.length === 0 ? acc + '\\' : acc });
    }
    return segs;
  }
  const parts = path.split('/').filter(Boolean);
  return [
    { label: '/', path: '/' },
    ...parts.map((p, i) => ({ label: p, path: '/' + parts.slice(0, i + 1).join('/') })),
  ];
}

export function FileBrowserModal({
  open,
  onOpenChange,
  instanceId,
  instanceName = '',
  awsProfile = '',
  awsRegion = '',
  platform = 'linux',
  onUpload,
  onDownload,
  onExpressDownload,
}: FileBrowserModalProps) {
  const win = isWindows(platform);
  const [currentPath, setCurrentPath] = useState(() => rootPath(platform));
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pushToast = useToastStore((s) => s.push);
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);

  // Keep a ref to the latest props so the useEffect that depends only on
  // [open, instanceId] can still call browse with up-to-date values.
  const browsePropsRef = useRef({ instanceId, awsProfile, awsRegion, platform });
  useEffect(() => {
    browsePropsRef.current = { instanceId, awsProfile, awsRegion, platform };
  });

  const browse = useCallback(async (path: string) => {
    const { instanceId: id, awsProfile: prof, awsRegion: reg, platform: plat } = browsePropsRef.current;
    setLoading(true);
    setError('');
    setEntries([]);
    const res = await api.post<BackendFileEntry[]>('/browse-directory', {
      instance_id: id,
      path,
      ...(prof && { aws_profile: prof }),
      ...(reg && { aws_region: reg }),
      ...(plat && { platform: plat }),
    });
    if (res.ok) {
      const raw = res.data as BackendFileEntry[];
      const normalized = raw.map(normalize).sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(normalized);
      setCurrentPath(path);
    } else {
      const msg = parseErrorMessage(res.error?.message ?? 'Unknown error');
      setError(msg);
      pushToast({ variant: 'danger', title: 'Browse failed', description: msg });
    }
    setLoading(false);
  }, []); // stable — reads props via ref

  // Reset and browse whenever the modal opens or switches to a different instance
  useEffect(() => {
    if (!open) return;
    const root = rootPath(browsePropsRef.current.platform);
    setEntries([]);
    setError('');
    setCurrentPath(root);
    void browse(root);
  }, [open, instanceId, browse]);

  const handleEntryClick = useCallback((entry: DirEntry) => {
    if (entry.isDir) {
      void browse(joinPath(currentPath, entry.name, win));
    } else {
      onDownload?.(joinPath(currentPath, entry.name, win));
    }
  }, [currentPath, win, browse, onDownload]);

  const handleNavigateTo = useCallback((path: string) => {
    void browse(path);
  }, [browse]);

  const goUp = useCallback(() => {
    const parent = parentPath(currentPath, win);
    if (parent) void browse(parent);
  }, [currentPath, win, browse]);

  const fullPath = useCallback((name: string) => joinPath(currentPath, name, win), [currentPath, win]);

  const crumbs = useMemo(() => breadcrumbSegments(currentPath, win), [currentPath, win]);
  const canGoUp = parentPath(currentPath, win) !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`File Browser${instanceName ? ` — ${instanceName}` : ''}`}
      size="lg"
      footer={
        <Button
          variant="primary"
          size="sm"
          icon={<Upload size={13} />}
          onClick={() => onUpload?.(currentPath)}
        >
          Upload here
        </Button>
      }
    >
      <div className="space-y-3">
        {/* Breadcrumb nav */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canGoUp || loading}
            onClick={goUp}
            className="text-text-dim hover:text-text-pri disabled:opacity-30 transition-colors p-0.5 shrink-0"
            aria-label="Go up"
          >
            <ArrowLeft size={14} />
          </button>
          <nav aria-label="File path" className="flex items-center gap-1 flex-wrap min-w-0">
            {crumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-1">
                {i === 0 && !win ? (
                  <button
                    type="button"
                    className="text-accent hover:underline text-[12px] flex items-center gap-0.5"
                    onClick={() => handleNavigateTo('/')}
                    aria-label="Root"
                  >
                    <Home size={12} />
                  </button>
                ) : (
                  <>
                    {i > 0 && <ChevronRight size={12} className="text-text-dim shrink-0" />}
                    <button
                      type="button"
                      className={`text-[12px] hover:underline max-w-[160px] truncate ${
                        i === crumbs.length - 1 ? 'text-text-pri font-medium' : 'text-accent'
                      }`}
                      title={crumb.path}
                      onClick={() => handleNavigateTo(crumb.path)}
                    >
                      {crumb.label}
                    </button>
                  </>
                )}
              </span>
            ))}
          </nav>
        </div>

        {error && (
          <p className="text-[11px] text-danger bg-danger/10 rounded px-2 py-1">{error}</p>
        )}

        {loading ? (
          <div className="py-8 text-center text-text-dim text-[12px]">Loading…</div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-[12px] table-fixed">
              <colgroup>
                <col className="w-auto" />
                <col className="w-20" />
                <col className="w-32" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-elev">
                  <th className="text-left px-3 py-2 font-medium text-text-dim">Name</th>
                  <th className="text-right px-3 py-2 font-medium text-text-dim">Size</th>
                  <th className="text-right px-3 py-2 font-medium text-text-dim">Modified</th>
                  <th className="text-right px-3 py-2 font-medium text-text-dim">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-text-dim">
                      {error ? 'Could not load directory' : 'Empty directory'}
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr
                    key={entry.name}
                    className="border-b border-border last:border-0 hover:bg-elev transition-colors"
                  >
                    {/* Name — truncated with tooltip */}
                    <td className="px-3 py-2 min-w-0">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left w-full min-w-0"
                        onClick={() => handleEntryClick(entry)}
                        title={entry.name}
                      >
                        {entry.isDir ? (
                          <Folder size={14} className="text-accent shrink-0" />
                        ) : (
                          <FileIcon size={14} className="text-text-dim shrink-0" />
                        )}
                        <span className="text-text-pri truncate hover:underline">{entry.name}</span>
                      </button>
                    </td>

                    {/* Size */}
                    <td className="px-3 py-2 text-right text-text-dim whitespace-nowrap">
                      {entry.isDir ? '—' : formatBytes(entry.size)}
                    </td>

                    {/* Modified */}
                    <td className="px-3 py-2 text-right text-text-dim whitespace-nowrap">
                      {formatDate(entry.modified)}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-right">
                      {!entry.isDir && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="text-text-dim hover:text-accent transition-colors p-0.5"
                            title={`Download ${entry.name}`}
                            aria-label={`Download ${entry.name}`}
                            onClick={() => onDownload?.(fullPath(entry.name))}
                          >
                            <Download size={13} />
                          </button>
                          {s3Bucket && onExpressDownload && (
                            <button
                              type="button"
                              className="text-text-dim hover:text-success transition-colors p-0.5 text-[10px] font-medium"
                              title="Express download via S3"
                              aria-label={`Express download ${entry.name}`}
                              onClick={() => onExpressDownload(fullPath(entry.name))}
                            >
                              S3
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}

FileBrowserModal.displayName = 'FileBrowserModal';
