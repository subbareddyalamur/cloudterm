export type ShortcutHandler = (e: KeyboardEvent) => void;

export interface Binding {
  keys: string;
  handler: ShortcutHandler;
  description: string;
  scope: string;
}

class ShortcutRegistry {
  private bindings: Binding[] = [];

  register(b: Binding): () => void {
    this.bindings.push(b);
    return () => {
      this.bindings = this.bindings.filter((x) => x !== b);
    };
  }

  handle(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    // Allow Ctrl/Cmd shortcuts in inputs/textareas, but block plain keys
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;
    if (isInput && !e.ctrlKey && !e.metaKey) return;

    const combo = normalize(e);
    for (const b of this.bindings) {
      if (b.keys === combo) {
        b.handler(e);
        break;
      }
    }
  }

  list(): Binding[] {
    return [...this.bindings];
  }
}

function normalize(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.metaKey) parts.push('cmd');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

export const shortcuts = new ShortcutRegistry();

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => shortcuts.handle(e));
}
