import { create } from "zustand";

const STORAGE_KEY = "cloudterm_settings";

export interface AIConfig {
  provider: string;
  model: string;
  bedrockRegion: string;
  bedrockProfile: string;
  anthropicKey: string;
  openaiKey: string;
  geminiKey: string;
  ollamaUrl: string;
  maxTokens: number;
}

interface SettingsState {
  pageTheme: string;
  termTheme: string;
  appZoom: number;
  s3Bucket: string;
  envColorsEnabled: boolean;
  envColorMap: Record<string, string>;
  aiConfig: AIConfig;
}

interface SettingsActions {
  setPageTheme: (theme: string) => void;
  setTermTheme: (theme: string) => void;
  setAppZoom: (zoom: number) => void;
  setS3Bucket: (bucket: string) => void;
  setEnvColorsEnabled: (enabled: boolean) => void;
  setEnvColorMap: (map: Record<string, string>) => void;
  setAIConfig: (config: Partial<AIConfig>) => void;
  /** Bulk-load from server preferences response. */
  loadFromServer: (prefs: Record<string, unknown>) => void;
  /** Push current settings to backend. Call after mutations. */
  syncToBackend: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const defaultAIConfig: AIConfig = {
  provider: "bedrock",
  model: "",
  bedrockRegion: "us-east-1",
  bedrockProfile: "dev",
  anthropicKey: "",
  openaiKey: "",
  geminiKey: "",
  ollamaUrl: "http://localhost:11434",
  maxTokens: 4096,
};

function loadFromLocalStorage(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, string>;
    return {
      s3Bucket: data.s3_bucket ?? "",
      appZoom: parseInt(data.app_zoom, 10) || 100,
      envColorsEnabled: data.env_colors_enabled === "true",
      envColorMap: data.env_color_map
        ? JSON.parse(data.env_color_map)
        : {},
    };
  } catch {
    return {};
  }
}

function persistToLocalStorage(state: SettingsState) {
  try {
    const data: Record<string, string> = {
      s3_bucket: state.s3Bucket,
      app_zoom: String(state.appZoom),
      env_colors_enabled: state.envColorsEnabled ? "true" : "false",
      env_color_map: JSON.stringify(state.envColorMap),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncToBackend(getState: () => SettingsState) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const s = getState();
    const body: Record<string, unknown> = {
      page_theme: s.pageTheme,
      term_theme: s.termTheme,
      env_colors_enabled: s.envColorsEnabled,
      env_color_map: s.envColorMap,
      aiProvider: s.aiConfig.provider,
      aiModel: s.aiConfig.model,
      aiBedrockRegion: s.aiConfig.bedrockRegion,
      aiBedrockProfile: s.aiConfig.bedrockProfile,
      aiAnthropicKey: s.aiConfig.anthropicKey,
      aiOpenAIKey: s.aiConfig.openaiKey,
      aiGeminiKey: s.aiConfig.geminiKey,
      aiOllamaUrl: s.aiConfig.ollamaUrl,
      aiMaxTokens: s.aiConfig.maxTokens,
    };
    fetch("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, 500);
}

const persisted = loadFromLocalStorage();

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  pageTheme: localStorage.getItem("cloudterm_page_theme") ?? "dark",
  termTheme: localStorage.getItem("cloudterm_term_theme") ?? "github-dark",
  appZoom: persisted.appZoom ?? 100,
  s3Bucket: persisted.s3Bucket ?? "",
  envColorsEnabled: persisted.envColorsEnabled ?? false,
  envColorMap: persisted.envColorMap ?? {},
  aiConfig: { ...defaultAIConfig },

  setPageTheme: (theme) => {
    set({ pageTheme: theme });
    try { localStorage.setItem("cloudterm_page_theme", theme); } catch {}
    scheduleSyncToBackend(() => get());
  },

  setTermTheme: (theme) => {
    set({ termTheme: theme });
    try { localStorage.setItem("cloudterm_term_theme", theme); } catch {}
    scheduleSyncToBackend(() => get());
  },

  setAppZoom: (zoom) => {
    set({ appZoom: zoom });
    persistToLocalStorage(get());
    scheduleSyncToBackend(() => get());
  },

  setS3Bucket: (bucket) => {
    set({ s3Bucket: bucket });
    persistToLocalStorage(get());
  },

  setEnvColorsEnabled: (enabled) => {
    set({ envColorsEnabled: enabled });
    persistToLocalStorage(get());
    scheduleSyncToBackend(() => get());
  },

  setEnvColorMap: (map) => {
    set({ envColorMap: map });
    persistToLocalStorage(get());
    scheduleSyncToBackend(() => get());
  },

  setAIConfig: (partial) => {
    set((state) => ({ aiConfig: { ...state.aiConfig, ...partial } }));
    scheduleSyncToBackend(() => get());
  },

  loadFromServer: (prefs) => {
    const updates: Partial<SettingsState> = {};
    if (typeof prefs.page_theme === "string") updates.pageTheme = prefs.page_theme;
    if (typeof prefs.term_theme === "string") updates.termTheme = prefs.term_theme;
    if (prefs.env_colors_enabled !== undefined) {
      updates.envColorsEnabled =
        prefs.env_colors_enabled === true || prefs.env_colors_enabled === "true";
    }
    if (typeof prefs.env_color_map === "object" && prefs.env_color_map !== null) {
      updates.envColorMap = prefs.env_color_map as Record<string, string>;
    }
    if (typeof prefs.aiProvider === "string") {
      updates.aiConfig = {
        ...get().aiConfig,
        provider: (prefs.aiProvider as string) || "bedrock",
        model: (prefs.aiModel as string) ?? "",
        bedrockRegion: (prefs.aiBedrockRegion as string) ?? "us-east-1",
        bedrockProfile: (prefs.aiBedrockProfile as string) ?? "dev",
        anthropicKey: (prefs.aiAnthropicKey as string) ?? "",
        openaiKey: (prefs.aiOpenAIKey as string) ?? "",
        geminiKey: (prefs.aiGeminiKey as string) ?? "",
        ollamaUrl: (prefs.aiOllamaUrl as string) ?? "http://localhost:11434",
        maxTokens: (prefs.aiMaxTokens as number) ?? 4096,
      };
    }
    set(updates);
    persistToLocalStorage(get());
  },

  syncToBackend: () => scheduleSyncToBackend(() => get()),
}));
