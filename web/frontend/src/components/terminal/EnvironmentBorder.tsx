import type { ReactNode } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useInstanceStore } from "@/stores/useInstanceStore";

export interface EnvironmentBorderProps {
  sessionId: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a terminal pane with a colored border + subtle glow based on the
 * instance's environment tag (tag2_value). The color is looked up in the
 * user-configured env color map from settings.
 *
 * Disabled by default — enable via Settings → Appearance → Environment Colors.
 */
export function EnvironmentBorder({
  sessionId,
  children,
  className,
}: EnvironmentBorderProps) {
  const envColorsEnabled = useSettingsStore((s) => s.envColorsEnabled);
  const envColorMap = useSettingsStore((s) => s.envColorMap);
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const flatInstances = useInstanceStore((s) => s.flatInstances);

  let borderStyle: React.CSSProperties | undefined;

  if (envColorsEnabled && session) {
    const instance = flatInstances.find(
      (i) => i.instance_id === session.instanceId,
    );
    if (instance) {
      const env = (instance.tag2_value || "").toLowerCase();
      const color = envColorMap[env];
      if (color) {
        borderStyle = {
          border: `2px solid ${color}`,
          boxShadow: `inset 0 0 8px 0 ${color}33`,
          borderRadius: 4,
        };
      }
    }
  }

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        ...borderStyle,
      }}
    >
      {children}
    </div>
  );
}
