import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import type { Node, ReactFlowInstance } from "@xyflow/react";

interface SearchBarProps {
  nodes: Node[];
  flowInstance: ReactFlowInstance | null;
  onHighlight: (nodeId: string | null) => void;
}

export function SearchBar({ nodes, flowInstance, onHighlight }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Node[]>([]);
  const [open, setOpen] = useState(false);

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (!q.trim()) {
        setResults([]);
        setOpen(false);
        onHighlight(null);
        return;
      }
      const lower = q.toLowerCase();
      const matched = nodes.filter((n) => {
        const d = n.data as { label?: string; sublabel?: string };
        const label = (d.label ?? "").toLowerCase();
        const sublabel = (d.sublabel ?? "").toLowerCase();
        return (
          label.includes(lower) ||
          sublabel.includes(lower) ||
          n.id.toLowerCase().includes(lower)
        );
      });
      setResults(matched.slice(0, 10));
      setOpen(matched.length > 0);
    },
    [nodes, onHighlight],
  );

  const focusNode = useCallback(
    (node: Node) => {
      if (!flowInstance) return;
      onHighlight(node.id);
      setOpen(false);
      setQuery("");

      // Zoom to the node with some padding
      const x = node.position.x;
      const y = node.position.y;
      flowInstance.setCenter(x + 80, y + 25, { zoom: 1.5, duration: 600 });
    },
    [flowInstance, onHighlight],
  );

  return (
    <div className="absolute top-3 left-3 z-40 w-64">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search resources…"
          className="w-full pl-8 pr-3 py-2 text-sm bg-card border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      {open && results.length > 0 && (
        <div className="mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((node) => {
            const d = node.data as { label?: string; sublabel?: string };
            return (
              <button
                key={node.id}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex flex-col"
                onMouseDown={(e) => {
                  e.preventDefault();
                  focusNode(node);
                }}
              >
                <span className="font-medium truncate">{d.label ?? node.id}</span>
                {d.sublabel && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    {d.sublabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
