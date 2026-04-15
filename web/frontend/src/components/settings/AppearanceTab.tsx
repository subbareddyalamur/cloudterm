import { useCallback, useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { TERMINAL_THEMES } from "@/components/terminal/themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// Page themes (keys must match PAGE_THEMES in app.js)
// ---------------------------------------------------------------------------

const PAGE_THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "nord", label: "Nord" },
  { value: "dracula", label: "Dracula" },
  { value: "cyber", label: "Cyberpunk" },
  { value: "warp-hero", label: "Warp Hero" },
  { value: "light", label: "Light" },
  { value: "railway", label: "Railway" },
  { value: "replit", label: "Replit" },
  { value: "raycast", label: "Raycast" },
  { value: "unify", label: "Unify" },
];

const TERMINAL_THEME_OPTIONS = Object.keys(TERMINAL_THEMES).map((key) => ({
  value: key,
  label: key
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" "),
}));

// ---------------------------------------------------------------------------
// Default env color map
// ---------------------------------------------------------------------------

const DEFAULT_ENV_COLORS: Record<string, string> = {
  production: "#ef4444",
  staging: "#f97316",
  development: "#22c55e",
  testing: "#3b82f6",
};

export function AppearanceTab() {
  const pageTheme = useSettingsStore((s) => s.pageTheme);
  const termTheme = useSettingsStore((s) => s.termTheme);
  const appZoom = useSettingsStore((s) => s.appZoom);
  const envColorsEnabled = useSettingsStore((s) => s.envColorsEnabled);
  const envColorMap = useSettingsStore((s) => s.envColorMap);
  const setPageTheme = useSettingsStore((s) => s.setPageTheme);
  const setTermTheme = useSettingsStore((s) => s.setTermTheme);
  const setAppZoom = useSettingsStore((s) => s.setAppZoom);
  const setEnvColorsEnabled = useSettingsStore((s) => s.setEnvColorsEnabled);
  const setEnvColorMap = useSettingsStore((s) => s.setEnvColorMap);

  const newEnvRef = useRef<HTMLInputElement>(null);
  const newColorRef = useRef<HTMLInputElement>(null);

  // Live-apply page theme via CSS custom properties
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("cloudterm-theme-changed"));
  }, [pageTheme]);

  const handleAddEnvColor = useCallback(() => {
    const name = (newEnvRef.current?.value ?? "").trim().toLowerCase();
    if (!name) return;
    const color = newColorRef.current?.value ?? "#ef4444";
    setEnvColorMap({ ...envColorMap, [name]: color });
    if (newEnvRef.current) newEnvRef.current.value = "";
  }, [envColorMap, setEnvColorMap]);

  const handleRemoveEnvColor = useCallback(
    (name: string) => {
      const next = { ...envColorMap };
      delete next[name];
      setEnvColorMap(next);
    },
    [envColorMap, setEnvColorMap],
  );

  const envEntries = Object.entries(
    Object.keys(envColorMap).length > 0 ? envColorMap : DEFAULT_ENV_COLORS,
  );

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-foreground">Appearance</h3>

      {/* App theme */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">App Theme</label>
        <Select value={pageTheme} onValueChange={setPageTheme}>
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_THEME_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Terminal theme */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Terminal Theme</label>
        <Select value={termTheme} onValueChange={setTermTheme}>
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERMINAL_THEME_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Live preview swatch */}
        {TERMINAL_THEMES[termTheme] && (
          <div
            className="mt-1 flex gap-1 rounded border border-border p-2"
            style={{
              backgroundColor: TERMINAL_THEMES[termTheme].background,
            }}
          >
            {(
              [
                "foreground",
                "red",
                "green",
                "yellow",
                "blue",
                "magenta",
                "cyan",
              ] as const
            ).map((key) => (
              <span
                key={key}
                className="size-4 rounded-full"
                style={{
                  backgroundColor:
                    (TERMINAL_THEMES[termTheme] as Record<string, string>)[
                      key
                    ] ?? "#888",
                }}
                title={key}
              />
            ))}
          </div>
        )}
      </div>

      {/* Font size / zoom */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Interface Zoom — {appZoom}%
        </label>
        <input
          type="range"
          min={50}
          max={200}
          step={10}
          value={appZoom}
          onChange={(e) => setAppZoom(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Environment colors */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">
            Environment Color Mapping
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-xs text-muted-foreground">Enabled</span>
            <button
              role="switch"
              aria-checked={envColorsEnabled}
              onClick={() => setEnvColorsEnabled(!envColorsEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                envColorsEnabled ? "bg-blue-600" : "bg-[var(--dim)]"
              }`}
            >
              <span
                className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
                  envColorsEnabled
                    ? "translate-x-[18px]"
                    : "translate-x-[3px]"
                }`}
              />
            </button>
          </label>
        </div>

        {envColorsEnabled && (
          <>
            <div className="space-y-1">
              {envEntries.map(([name, color]) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded bg-[var(--s2)] px-2 py-1"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 text-xs text-foreground capitalize">
                    {name}
                  </span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) =>
                      setEnvColorMap({ ...envColorMap, [name]: e.target.value })
                    }
                    className="size-6 cursor-pointer rounded border-0 bg-transparent"
                  />
                  <button
                    onClick={() => handleRemoveEnvColor(name)}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new env color */}
            <div className="flex items-center gap-2">
              <Input
                ref={newEnvRef}
                placeholder="environment name"
                className="h-7 flex-1 text-xs"
              />
              <input
                ref={newColorRef}
                type="color"
                defaultValue="#ef4444"
                className="size-7 cursor-pointer rounded border-0 bg-transparent"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleAddEnvColor}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
