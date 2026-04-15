import { useCallback, useState } from "react";
import { toggleRecording as apiToggleRecording } from "@/lib/api";

/**
 * Hook to toggle session recording on/off.
 * Returns `{ recording, toggle }` — wire `toggle` to `onRecord` on TerminalTitleBar,
 * and pass `recording` to the `recording` prop.
 */
export function useRecordingToggle(sessionId: string, initialRecording = false) {
  const [recording, setRecording] = useState(initialRecording);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiToggleRecording({
        session_id: sessionId,
        enabled: !recording,
      });
      setRecording((prev) => !prev);
    } catch {
      /* api layer shows toast */
    } finally {
      setBusy(false);
    }
  }, [sessionId, recording, busy]);

  return { recording, toggle, busy } as const;
}
