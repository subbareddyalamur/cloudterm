import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { X } from "lucide-react";
import { Terminal } from "./Terminal";
import { EnvironmentBorder } from "./EnvironmentBorder";
import { useShortcuts } from "@/hooks/useShortcuts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Layout tree types
// ---------------------------------------------------------------------------

export interface LeafNode {
  type: "leaf";
  id: string;
  sessionId: string;
}

export interface SplitNode {
  type: "horizontal" | "vertical";
  id: string;
  children: LayoutNode[];
  /** Fractional sizes (0–1) for each child. Must sum to 1. */
  sizes: number[];
}

export type LayoutNode = LeafNode | SplitNode;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nodeCounter = 0;
function nextId(): string {
  return `pane-${++_nodeCounter}`;
}

/** Create a single-leaf layout from a session id. */
export function createLeaf(sessionId: string): LeafNode {
  return { type: "leaf", id: nextId(), sessionId };
}

/** Split a leaf node into two panes. Returns the replacement SplitNode. */
function splitLeaf(
  leaf: LeafNode,
  direction: "horizontal" | "vertical",
  newSessionId: string,
): SplitNode {
  const newLeaf = createLeaf(newSessionId);
  return {
    type: direction,
    id: nextId(),
    children: [{ ...leaf }, newLeaf],
    sizes: [0.5, 0.5],
  };
}

/** Deep-clone + transform: replace the node with the given id. */
function replaceNode(
  root: LayoutNode,
  targetId: string,
  replacer: (node: LayoutNode) => LayoutNode | null,
): LayoutNode | null {
  if (root.id === targetId) return replacer(root);
  if (root.type === "leaf") return root;

  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];

  for (let i = 0; i < root.children.length; i++) {
    const result = replaceNode(root.children[i], targetId, replacer);
    if (result !== null) {
      newChildren.push(result);
      newSizes.push(root.sizes[i]);
    }
  }

  // If a child was removed, redistribute its space
  if (newChildren.length < root.children.length) {
    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0]; // promote up
    const total = newSizes.reduce((a, b) => a + b, 0);
    for (let i = 0; i < newSizes.length; i++) newSizes[i] /= total;
  }

  return { ...root, children: newChildren, sizes: newSizes };
}

/** Update sizes array at a specific split node. */
function updateSizes(
  root: LayoutNode,
  splitId: string,
  sizes: number[],
): LayoutNode {
  if (root.id === splitId && root.type !== "leaf") {
    return { ...root, sizes };
  }
  if (root.type === "leaf") return root;
  return {
    ...root,
    children: root.children.map((c) => updateSizes(c, splitId, sizes)),
  };
}

/** Collect all leaf session ids in the tree. */
export function collectSessionIds(node: LayoutNode): string[] {
  if (node.type === "leaf") return [node.sessionId];
  return node.children.flatMap(collectSessionIds);
}

/** Check whether the tree has more than one leaf. */
export function hasSplits(node: LayoutNode): boolean {
  return node.type !== "leaf";
}

// ---------------------------------------------------------------------------
// Resize divider
// ---------------------------------------------------------------------------

function Divider({
  direction,
  onDrag,
}: {
  direction: "horizontal" | "vertical";
  onDrag: (delta: number) => void;
}) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastPos.current =
        direction === "horizontal" ? e.clientX : e.clientY;

      const onMove = (ev: globalThis.MouseEvent) => {
        if (!dragging.current) return;
        const pos =
          direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = pos - lastPos.current;
        lastPos.current = pos;
        onDrag(delta);
      };

      const onUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [direction, onDrag],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "shrink-0 bg-[var(--border)] transition-colors hover:bg-[var(--accent)]",
        direction === "horizontal"
          ? "w-1 cursor-col-resize"
          : "h-1 cursor-row-resize",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Pane wrapper (leaf renderer)
// ---------------------------------------------------------------------------

function PaneLeaf({
  node,
  ws,
  focused,
  onFocus,
  onClose,
  showClose,
}: {
  node: LeafNode;
  ws: WebSocket | null;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
  showClose: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        focused
          ? "ring-1 ring-[var(--accent)] ring-inset"
          : "ring-1 ring-[var(--border)] ring-inset",
      )}
      onMouseDown={onFocus}
    >
      {/* Close button */}
      {showClose && (
        <button
          title="Close pane"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded bg-[var(--surface)] text-[var(--dim)] opacity-0 transition-opacity hover:text-[var(--fg)] [div:hover>&]:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <EnvironmentBorder sessionId={node.sessionId} className="flex-1">
        <Terminal
          sessionId={node.sessionId}
          ws={ws}
          className="flex-1"
        />
      </EnvironmentBorder>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive layout renderer
// ---------------------------------------------------------------------------

function LayoutRenderer({
  node,
  ws,
  focusedId,
  onFocus,
  onClose,
  onResize,
  leafCount,
}: {
  node: LayoutNode;
  ws: WebSocket | null;
  focusedId: string;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onResize: (splitId: string, sizes: number[]) => void;
  leafCount: number;
}) {
  if (node.type === "leaf") {
    return (
      <PaneLeaf
        node={node}
        ws={ws}
        focused={node.id === focusedId}
        onFocus={() => onFocus(node.id)}
        onClose={() => onClose(node.id)}
        showClose={leafCount > 1}
      />
    );
  }

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDividerDrag = useCallback(
    (index: number, delta: number) => {
      const el = containerRef.current;
      if (!el) return;
      const totalPx =
        node.type === "horizontal" ? el.offsetWidth : el.offsetHeight;
      if (totalPx === 0) return;

      const fraction = delta / totalPx;
      const newSizes = [...node.sizes];
      const minFrac = 0.05; // minimum 5%

      newSizes[index] += fraction;
      newSizes[index + 1] -= fraction;

      if (newSizes[index] < minFrac || newSizes[index + 1] < minFrac) return;

      onResize(node.id, newSizes);
    },
    [node.id, node.sizes, node.type, onResize],
  );

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    if (i > 0) {
      elements.push(
        <Divider
          key={`div-${node.id}-${i}`}
          direction={node.type}
          onDrag={(delta) => handleDividerDrag(i - 1, delta)}
        />,
      );
    }

    const sizePercent = `${(node.sizes[i] * 100).toFixed(4)}%`;
    const style =
      node.type === "horizontal"
        ? { width: sizePercent, height: "100%" }
        : { height: sizePercent, width: "100%" };

    elements.push(
      <div key={node.children[i].id} style={style} className="min-h-0 min-w-0 flex">
        <LayoutRenderer
          node={node.children[i]}
          ws={ws}
          focusedId={focusedId}
          onFocus={onFocus}
          onClose={onClose}
          onResize={onResize}
          leafCount={leafCount}
        />
      </div>,
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-h-0 min-w-0 flex-1",
        node.type === "horizontal" ? "flex-row" : "flex-col",
      )}
    >
      {elements}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface SplitPaneProps {
  /** Initial session id for the root pane. */
  sessionId: string;
  /** WebSocket shared across all panes in this tab. */
  ws: WebSocket | null;
  /** Called when a new split is created — parent must provision a new session. */
  onCreateSession?: () => string | undefined;
  className?: string;
}

/**
 * Split terminal pane system. Renders a recursive layout tree where each leaf
 * is an independent terminal session. Supports horizontal/vertical splits,
 * drag-to-resize dividers, focus tracking, and pane close with promotion.
 */
export function SplitPane({
  sessionId,
  ws,
  onCreateSession,
  className,
}: SplitPaneProps) {
  const [layout, setLayout] = useState<LayoutNode>(() =>
    createLeaf(sessionId),
  );
  const [focusedId, setFocusedId] = useState(layout.id);

  // Keep root in sync if sessionId changes externally
  useEffect(() => {
    if (layout.type === "leaf" && layout.sessionId !== sessionId) {
      const newRoot = createLeaf(sessionId);
      setLayout(newRoot);
      setFocusedId(newRoot.id);
    }
    // Only react to sessionId changes, not layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const splitFocused = useCallback(
    (direction: "horizontal" | "vertical") => {
      const newSessionId = onCreateSession?.();
      if (!newSessionId) return;

      setLayout((prev) => {
        const next = replaceNode(prev, focusedId, (node) => {
          if (node.type !== "leaf") return node;
          return splitLeaf(node, direction, newSessionId);
        });
        return next ?? prev;
      });
    },
    [focusedId, onCreateSession],
  );

  const closePane = useCallback(
    (id: string) => {
      setLayout((prev) => {
        const next = replaceNode(prev, id, () => null);
        if (!next) return prev; // don't remove the last pane
        return next;
      });
      // If we closed the focused pane, pick the first remaining leaf
      setFocusedId((prevFocused) => {
        if (prevFocused !== id) return prevFocused;
        // We need to find a valid leaf in the new tree
        // Using a timeout to let state settle
        return prevFocused;
      });
    },
    [],
  );

  // Fix focus after a close removes the focused pane
  useEffect(() => {
    // Check if focusedId still exists in tree
    const exists = (function check(node: LayoutNode): boolean {
      if (node.id === focusedId) return true;
      if (node.type === "leaf") return false;
      return node.children.some(check);
    })(layout);

    if (!exists) {
      // Pick first leaf
      const firstLeaf = (function find(node: LayoutNode): string {
        if (node.type === "leaf") return node.id;
        return find(node.children[0]);
      })(layout);
      setFocusedId(firstLeaf);
    }
  }, [layout, focusedId]);

  const handleResize = useCallback(
    (splitId: string, sizes: number[]) => {
      setLayout((prev) => updateSizes(prev, splitId, sizes));
    },
    [],
  );

  // Keyboard shortcuts: Ctrl+Shift+D (horizontal), Ctrl+Shift+R (vertical)
  const shortcuts = useMemo(
    () => [
      {
        key: "d",
        ctrl: true,
        shift: true,
        handler: () => splitFocused("horizontal"),
        description: "Split pane horizontally",
        group: "Terminal",
      },
      {
        key: "r",
        ctrl: true,
        shift: true,
        handler: () => splitFocused("vertical"),
        description: "Split pane vertically",
        group: "Terminal",
      },
    ],
    [splitFocused],
  );

  useShortcuts(shortcuts);

  const leafCount = collectSessionIds(layout).length;

  return (
    <div className={cn("flex h-full w-full", className)}>
      <LayoutRenderer
        node={layout}
        ws={ws}
        focusedId={focusedId}
        onFocus={setFocusedId}
        onClose={closePane}
        onResize={handleResize}
        leafCount={leafCount}
      />
    </div>
  );
}
