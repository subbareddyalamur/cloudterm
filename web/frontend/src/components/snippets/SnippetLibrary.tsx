import { useState, useMemo, useCallback, useRef } from "react";
import {
  Code2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Play,
  Copy,
  Download,
  Upload,
  X,
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
import { useSessionStore } from "@/stores/useSessionStore";
import { getWSManager } from "@/lib/websocket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Snippet {
  id: string;
  name: string;
  command: string;
  description: string;
  category: string;
}

interface SnippetLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "cloudterm_snippets";

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: "d1", name: "Disk Usage", command: "df -h", description: "Show disk space usage", category: "System" },
  { id: "d2", name: "Memory Usage", command: "free -m", description: "Show memory in MB", category: "System" },
  { id: "d3", name: "Top Processes", command: "top -bn1 | head -20", description: "Snapshot of top processes", category: "System" },
  { id: "d4", name: "System Uptime", command: "uptime", description: "System uptime and load", category: "System" },
  { id: "d5", name: "Network Connections", command: "ss -tlnp", description: "Listening ports and connections", category: "Network" },
  { id: "d6", name: "Service Status", command: "systemctl status", description: "Overview of systemd services", category: "Services" },
];

const CATEGORIES = ["All", "System", "Network", "Services", "Custom"];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Snippet[];
      // Migrate older snippets that lack a category field
      return parsed.map((s) => ({ ...s, category: s.category || "Custom" }));
    }
  } catch {
    // corrupt data — fall through to defaults
  }
  const defaults = [...DEFAULT_SNIPPETS];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

function saveSnippets(snippets: Snippet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SnippetLibrary({ open, onOpenChange }: SnippetLibraryProps) {
  const [snippets, setSnippets] = useState<Snippet[]>(loadSnippets);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("Custom");
  const [showForm, setShowForm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // Persist helper
  const persist = useCallback((next: Snippet[]) => {
    setSnippets(next);
    saveSnippets(next);
  }, []);

  // Filtered snippets
  const filtered = useMemo(() => {
    let list = snippets;
    if (activeCategory !== "All") {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.command.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [snippets, activeCategory, search]);

  // Categories present in current snippets (plus defaults)
  const allCategories = useMemo(() => {
    const cats = new Set(CATEGORIES);
    for (const s of snippets) cats.add(s.category);
    return ["All", ...Array.from(cats).filter((c) => c !== "All").sort()];
  }, [snippets]);

  // Reset form
  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormName("");
    setFormCommand("");
    setFormDescription("");
    setFormCategory("Custom");
    setShowForm(false);
  }, []);

  // Start editing
  const startEdit = useCallback((s: Snippet) => {
    setEditingId(s.id);
    setFormName(s.name);
    setFormCommand(s.command);
    setFormDescription(s.description);
    setFormCategory(s.category);
    setShowForm(true);
  }, []);

  // Save (add or update)
  const saveSnippet = useCallback(() => {
    const name = formName.trim();
    const command = formCommand.trim();
    if (!name || !command) return;

    if (editingId) {
      // Update
      const next = snippets.map((s) =>
        s.id === editingId
          ? { ...s, name, command, description: formDescription.trim(), category: formCategory }
          : s,
      );
      persist(next);
    } else {
      // Add
      const newSnippet: Snippet = {
        id: "u" + Date.now(),
        name,
        command,
        description: formDescription.trim(),
        category: formCategory,
      };
      persist([...snippets, newSnippet]);
    }
    resetForm();
  }, [editingId, formName, formCommand, formDescription, formCategory, snippets, persist, resetForm]);

  // Delete
  const deleteSnippet = useCallback(
    (id: string) => {
      persist(snippets.filter((s) => s.id !== id));
    },
    [snippets, persist],
  );

  // Insert into active terminal
  const insertToTerminal = useCallback(
    (command: string) => {
      if (!activeSessionId) return;
      const ws = getWSManager();
      ws.send("terminal_input", {
        session_id: activeSessionId,
        input: command,
      });
    },
    [activeSessionId],
  );

  // Copy to clipboard
  const copyToClipboard = useCallback(async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Fallback — ignore
    }
  }, []);

  // Export as JSON
  const exportSnippets = useCallback(() => {
    const json = JSON.stringify(snippets, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudterm-snippets.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [snippets]);

  // Import from JSON
  const importSnippets = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arr = JSON.parse(reader.result as string);
          if (!Array.isArray(arr)) return;
          const imported: Snippet[] = arr.map((s: Partial<Snippet>) => ({
            id: s.id || "i" + Date.now() + Math.random().toString(36).slice(2),
            name: s.name || "Untitled",
            command: s.command || "",
            description: s.description || "",
            category: s.category || "Custom",
          }));
          persist(imported);
        } catch {
          // Invalid JSON — ignore
        }
      };
      reader.readAsText(file);
      // Reset file input so re-selecting the same file triggers onChange
      event.target.value = "";
    },
    [persist],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      else setSnippets(loadSnippets());
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="size-5" />
            Saved Snippets
          </DialogTitle>
          <DialogDescription>
            Manage command snippets. Click insert to send a command to the
            active terminal.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar: search + actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search snippets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
          <Button variant="outline" size="sm" onClick={exportSnippets}>
            <Download className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={importSnippets}
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1">
          {allCategories.map((cat) => (
            <Badge
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              className="cursor-pointer select-none"
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>

        {/* Add / Edit form */}
        {showForm && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {editingId ? "Edit Snippet" : "New Snippet"}
              </span>
              <Button variant="ghost" size="icon-xs" onClick={resetForm}>
                <X className="size-3.5" />
              </Button>
            </div>
            <Input
              placeholder="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="h-8"
            />
            <textarea
              className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none resize-y font-mono dark:bg-input/30"
              placeholder="Command or script (multi-line supported)"
              value={formCommand}
              onChange={(e) => setFormCommand(e.target.value)}
              rows={2}
            />
            <Input
              placeholder="Description (optional)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="h-8"
            />
            <div className="flex items-center gap-2">
              <Input
                placeholder="Category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="h-8 w-40"
                list="snippet-categories"
              />
              <datalist id="snippet-categories">
                {CATEGORIES.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Button size="sm" onClick={saveSnippet} disabled={!formName.trim() || !formCommand.trim()}>
                {editingId ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        )}

        {/* Snippet list */}
        <ScrollArea className="flex-1 min-h-0 max-h-[40vh] rounded-md border">
          <div className="p-1 space-y-1">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {snippets.length === 0
                  ? "No snippets yet. Add one above."
                  : "No snippets match your search."}
              </div>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {s.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {s.category}
                      </Badge>
                    </div>
                    <pre className="mt-1 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {s.command}
                    </pre>
                    {s.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground/70">
                        {s.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Insert into terminal"
                      onClick={() => insertToTerminal(s.command)}
                      disabled={!activeSessionId}
                    >
                      <Play className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Copy to clipboard"
                      onClick={() => copyToClipboard(s.command)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Edit"
                      onClick={() => startEdit(s)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Delete"
                      onClick={() => deleteSnippet(s.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <span className="flex-1 text-xs text-muted-foreground">
            {snippets.length} snippet{snippets.length !== 1 ? "s" : ""}
          </span>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
