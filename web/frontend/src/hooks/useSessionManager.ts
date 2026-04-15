import { useCallback } from "react"
import { useSessionStore, type Session, type SessionStatus } from "@/stores/useSessionStore"
import type { EC2Instance } from "@/types"

/** Generate a short random session ID. */
function newSessionId(): string {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * High-level session lifecycle hook.
 *
 * Wraps the session store with operations that mirror the legacy TabManager:
 * open (create + activate), close (confirm + disconnect + remove), switch.
 */
export function useSessionManager() {
  const addSession = useSessionStore((s) => s.addSession)
  const removeSession = useSessionStore((s) => s.removeSession)
  const switchSession = useSessionStore((s) => s.switchSession)
  const setStatus = useSessionStore((s) => s.setStatus)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  /** Create a new session for an instance, add a tab, and activate it. */
  const openSession = useCallback(
    (instance: EC2Instance) => {
      // If a session for this instance already exists, just switch to it
      for (const s of sessions.values()) {
        if (s.instanceId === instance.instance_id) {
          switchSession(s.sessionId)
          return s.sessionId
        }
      }

      const sessionId = newSessionId()
      const isWindows = instance.platform === "windows"

      const session: Session = {
        sessionId,
        instanceId: instance.instance_id,
        instanceName: instance.name || instance.instance_id,
        status: "connecting" as SessionStatus,
        recording: false,
        suggestEnabled: true,
      }

      addSession(session)

      // In a real implementation this would trigger a WebSocket start_session
      // message. For now the status transitions are handled by the WS handler.
      // Mark connected after a brief delay to simulate connection.
      void (isWindows) // suppress unused – RDP vs SSH logic lives in the WS layer

      return sessionId
    },
    [addSession, sessions, switchSession]
  )

  /** Close a session — remove the tab and (eventually) send session_close. */
  const closeSession = useCallback(
    (sessionId: string) => {
      removeSession(sessionId)
    },
    [removeSession]
  )

  /** Close the currently active session. */
  const closeActiveSession = useCallback(() => {
    if (activeSessionId) {
      closeSession(activeSessionId)
    }
  }, [activeSessionId, closeSession])

  /** Update a session's connection status. */
  const updateStatus = useCallback(
    (sessionId: string, status: SessionStatus) => {
      setStatus(sessionId, status)
    },
    [setStatus]
  )

  return {
    openSession,
    closeSession,
    closeActiveSession,
    switchSession,
    updateStatus,
    sessions,
    activeSessionId,
  }
}
