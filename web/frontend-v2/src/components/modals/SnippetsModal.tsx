import { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Copy, Terminal } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toast';

export interface SnippetsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert?: (command: string) => void;
}

interface Snippet {
  id: string;
  name: string;
  command: string;
  category: string;
}

interface PreferencesPayload {
  snippets?: Snippet[];
}

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: '1', name: 'Disk usage', command: 'df -h', category: 'System' },
  { id: '2', name: 'Memory usage', command: 'free -h', category: 'System' },
  { id: '3', name: 'CPU / processes', command: 'top -b -n 1 | head -20', category: 'System' },
  { id: '4', name: 'Uptime', command: 'uptime', category: 'System' },
  { id: '5', name: 'Listening ports', command: 'ss -tlnp', category: 'Network' },
  { id: '6', name: 'Systemd services', command: 'systemctl list-units --state=running', category: 'Services' },
];

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

export function SnippetsModal({ open, onOpenChange, onInsert }: SnippetsModalProps) {
  const [snippets, setSnippets] = useState<Snippet[]>(DEFAULT_SNIPPETS);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [saving, setSaving] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (!open) return;
    void api.get<PreferencesPayload>('/preferences').then((res) => {
      if (res.ok && res.data.snippets?.length) {
        setSnippets(res.data.snippets);
      }
    });
  }, [open]);

  const persist = useCallback(
    async (updated: Snippet[]) => {
      setSaving(true);
      const pref = await api.get<PreferencesPayload>('/preferences');
      const existing = pref.ok ? pref.data : {};
      const result = await api.post('/preferences', { ...existing, snippets: updated });
      setSaving(false);
      if (!result.ok) {
        pushToast({ variant: 'danger', title: 'Save failed', description: 'Could not save snippets' });
      }
    },
    [pushToast],
  );

  const handleSaveEdit = useCallback(
    async (s: Snippet) => {
      const updated = isNew
        ? [...snippets, s]
        : snippets.map((x) => (x.id === s.id ? s : x));
      setSnippets(updated);
      setEditing(null);
      setIsNew(false);
      await persist(updated);
    },
    [snippets, isNew, persist],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const updated = snippets.filter((s) => s.id !== id);
      setSnippets(updated);
      await persist(updated);
    },
    [snippets, persist],
  );

  const handleInsert = useCallback(
    (command: string) => {
      if (onInsert) {
        onInsert(command);
      } else {
        void navigator.clipboard.writeText(command).then(() => {
          pushToast({ variant: 'success', title: 'Copied', description: 'Command copied to clipboard' });
        });
      }
    },
    [onInsert, pushToast],
  );

  const filtered = useMemo(() => {
    if (!filterText.trim()) return snippets;
    const q = filterText.toLowerCase();
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [snippets, filterText]);

  const categories = useMemo(
    () => [...new Set(filtered.map((s) => s.category))].sort(),
    [filtered],
  );

  if (editing) {
    return (
      <SnippetEditor
        snippet={editing}
        isNew={isNew}
        saving={saving}
        onSave={(s) => void handleSaveEdit(s)}
        onCancel={() => { setEditing(null); setIsNew(false); }}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Snippets"
      size="lg"
      footer={
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => {
            setEditing({ id: nanoid(), name: '', command: '', category: 'General' });
            setIsNew(true);
          }}
        >
          New snippet
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          placeholder="Filter snippets…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="text-[12px]"
        />

        {categories.length === 0 && (
          <p className="text-center text-text-dim text-[12px] py-6">No snippets found</p>
        )}

        {categories.map((cat) => (
          <div key={cat}>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1.5 px-0.5">
              {cat}
            </h3>
            <div className="border border-border rounded divide-y divide-border">
              {filtered
                .filter((s) => s.category === cat)
                .map((snippet) => (
                  <div
                    key={snippet.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-elev group"
                  >
                    <Terminal size={13} className="text-text-dim shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-text-pri">{snippet.name}</p>
                      <p className="text-[11px] text-text-dim font-mono truncate">{snippet.command}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title="Insert command"
                        aria-label={`Insert ${snippet.name}`}
                        className="text-text-dim hover:text-accent transition-colors p-0.5"
                        onClick={() => handleInsert(snippet.command)}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        title="Edit"
                        aria-label={`Edit ${snippet.name}`}
                        className="text-text-dim hover:text-text-pri transition-colors p-0.5"
                        onClick={() => setEditing(snippet)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete ${snippet.name}`}
                        className="text-text-dim hover:text-danger transition-colors p-0.5"
                        onClick={() => void handleDelete(snippet.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

interface SnippetEditorProps {
  snippet: Snippet;
  isNew: boolean;
  saving: boolean;
  onSave: (s: Snippet) => void;
  onCancel: () => void;
}

function SnippetEditor({ snippet, isNew, saving, onSave, onCancel }: SnippetEditorProps) {
  const [name, setName] = useState(snippet.name);
  const [command, setCommand] = useState(snippet.command);
  const [category, setCategory] = useState(snippet.category);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!command.trim()) { setError('Command is required'); return; }
    onSave({ ...snippet, name: name.trim(), command: command.trim(), category: category.trim() || 'General' });
  };

  return (
    <Dialog
      open
      onOpenChange={onCancel}
      title={isNew ? 'New Snippet' : 'Edit Snippet'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="snip-name" className="text-[11px] font-medium text-text-mut block mb-1">Name</label>
          <Input id="snip-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Disk usage" />
        </div>
        <div>
          <label htmlFor="snip-cmd" className="text-[11px] font-medium text-text-mut block mb-1">Command</label>
          <Input id="snip-cmd" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="df -h" className="font-mono" />
        </div>
        <div>
          <label htmlFor="snip-cat" className="text-[11px] font-medium text-text-mut block mb-1">Category</label>
          <Input id="snip-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="System" />
        </div>
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

SnippetsModal.displayName = 'SnippetsModal';
