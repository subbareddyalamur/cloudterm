import { useEffect } from 'react';
import { shortcuts } from '@/lib/shortcuts';
import type { ShortcutHandler } from '@/lib/shortcuts';

interface UseShortcutOptions {
  keys: string;
  handler: ShortcutHandler;
  description?: string;
  scope?: string;
  enabled?: boolean;
}

export function useShortcut({
  keys,
  handler,
  description = '',
  scope = 'global',
  enabled = true,
}: UseShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const unsub = shortcuts.register({ keys, handler, description, scope });
    return unsub;
  }, [keys, handler, description, scope, enabled]);
}
