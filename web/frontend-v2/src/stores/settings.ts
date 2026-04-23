import { create } from 'zustand';
import { persist, createJSONStorage, devtools, subscribeWithSelector } from 'zustand/middleware';

export interface EnvColorMapping {
  env: string;
  color: string;
  width: number;
}

interface SettingsState {
  fontSize: number;
  fontFamily: string;
  appZoom: number;
  theme: string;
  compactMode: boolean;
  enableEnvBorders: boolean;
  scrollbackLines: number;
  aiProvider: string;
  aiModel: string;
  aiApiKey: string;
  bedrockAuthMode: 'profile' | 'api_key' | 'inference_profile';
  bedrockRegion: string;
  bedrockProfile: string;
  bedrockAccessKeyId: string;
  bedrockSecretKey: string;
  bedrockSessionToken: string;
  bedrockInferenceProfileArn: string;
  ollamaUrl: string;
  s3Bucket: string;
  enableDiagramBoard: boolean;
  enableFleetMap: boolean;
  envColors: EnvColorMapping[];
  snippets: Array<{ name: string; command: string; category?: string }>;
  setEnableDiagramBoard: (v: boolean) => void;
  setEnableFleetMap: (v: boolean) => void;
  setFontSize: (n: number) => void;
  setAppZoom: (n: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setTheme: (t: string) => void;
  setCompactMode: (v: boolean) => void;
  setEnableEnvBorders: (v: boolean) => void;
  setScrollbackLines: (n: number) => void;
  setS3Bucket: (b: string) => void;
  addEnvColor: (m: EnvColorMapping) => void;
  removeEnvColor: (env: string) => void;
  loadFromServer: () => Promise<void>;
  saveToServer: () => Promise<void>;
}

const DEFAULT_ENV_COLORS: EnvColorMapping[] = [
  { env: 'prod', color: '#F87171', width: 4 },
  { env: 'staging', color: '#F59E0B', width: 3 },
  { env: 'dev', color: '#3DD68C', width: 2 },
  { env: 'test', color: '#60A5FA', width: 2 },
];

const MIN_FONT = 10;
const MAX_FONT = 22;
const DEFAULT_FONT = 13;

export const useSettingsStore = create<SettingsState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          fontSize: DEFAULT_FONT,
          fontFamily: 'JetBrains Mono',
          appZoom: 100,
          theme: 'warp',
          compactMode: false,
          enableEnvBorders: true,
          scrollbackLines: 10000,
          aiProvider: 'bedrock',
          aiModel: 'claude-sonnet-4-5',
          aiApiKey: '',
          bedrockAuthMode: 'profile' as const,
          bedrockRegion: 'us-east-1',
          bedrockProfile: 'default',
          bedrockAccessKeyId: '',
          bedrockSecretKey: '',
          bedrockSessionToken: '',
          bedrockInferenceProfileArn: '',
          ollamaUrl: 'http://localhost:11434',
          s3Bucket: '',
          enableDiagramBoard: false,
          enableFleetMap: false,
          envColors: DEFAULT_ENV_COLORS,
          snippets: [],
          setEnableDiagramBoard: (v) => set({ enableDiagramBoard: v }),
          setEnableFleetMap: (v) => set({ enableFleetMap: v }),
          setFontSize: (n) => set({ fontSize: Math.max(MIN_FONT, Math.min(MAX_FONT, n)) }),
          setAppZoom: (n) => set({ appZoom: Math.max(50, Math.min(200, n)) }),
          zoomIn: () => get().setFontSize(get().fontSize + 1),
          zoomOut: () => get().setFontSize(get().fontSize - 1),
          resetZoom: () => set({ fontSize: DEFAULT_FONT, appZoom: 100 }),
          setTheme: (t) => set({ theme: t }),
          setCompactMode: (v) => set({ compactMode: v }),
          setEnableEnvBorders: (v) => set({ enableEnvBorders: v }),
          setScrollbackLines: (n) => set({ scrollbackLines: Math.max(1000, Math.min(100000, n)) }),
          setS3Bucket: (b) => set({ s3Bucket: b }),
          addEnvColor: (m) => set((s) => ({
            envColors: [...s.envColors.filter((e) => e.env !== m.env), m],
          })),
          removeEnvColor: (env) => set((s) => ({
            envColors: s.envColors.filter((e) => e.env !== env),
          })),
          loadFromServer: async () => {
            try {
              const res = await fetch('/preferences');
              if (!res.ok) return;
              const data = await res.json() as Record<string, unknown>;
              if (data && typeof data === 'object') {
                const patch: Partial<SettingsState> = {};
                if (typeof data.fontSize === 'number') patch.fontSize = data.fontSize as number;
                if (typeof data.fontFamily === 'string') patch.fontFamily = data.fontFamily as string;
                if (typeof data.theme === 'string') patch.theme = data.theme as string;
                if (typeof data.aiProvider === 'string') patch.aiProvider = data.aiProvider as string;
                if (typeof data.aiModel === 'string') patch.aiModel = data.aiModel as string;
                if (typeof data.aiApiKey === 'string') patch.aiApiKey = data.aiApiKey as string;
                if (typeof data.bedrockAuthMode === 'string') patch.bedrockAuthMode = data.bedrockAuthMode as SettingsState['bedrockAuthMode'];
                if (typeof data.bedrockRegion === 'string') patch.bedrockRegion = data.bedrockRegion as string;
                if (typeof data.bedrockProfile === 'string') patch.bedrockProfile = data.bedrockProfile as string;
                if (typeof data.bedrockAccessKeyId === 'string') patch.bedrockAccessKeyId = data.bedrockAccessKeyId as string;
                if (typeof data.bedrockSecretKey === 'string') patch.bedrockSecretKey = data.bedrockSecretKey as string;
                if (typeof data.bedrockSessionToken === 'string') patch.bedrockSessionToken = data.bedrockSessionToken as string;
                if (typeof data.bedrockInferenceProfileArn === 'string') patch.bedrockInferenceProfileArn = data.bedrockInferenceProfileArn as string;
                if (typeof data.ollamaUrl === 'string') patch.ollamaUrl = data.ollamaUrl as string;
                if (typeof data.s3Bucket === 'string') patch.s3Bucket = data.s3Bucket as string;
                if (typeof data.compactMode === 'boolean') patch.compactMode = data.compactMode as boolean;
                if (Array.isArray(data.envColors)) patch.envColors = data.envColors as EnvColorMapping[];
                if (Array.isArray(data.snippets)) patch.snippets = data.snippets as Array<{ name: string; command: string; category?: string }>;
                if (typeof data.enableEnvBorders === 'boolean') patch.enableEnvBorders = data.enableEnvBorders as boolean;
                if (typeof data.scrollbackLines === 'number') patch.scrollbackLines = data.scrollbackLines as number;
                set(patch);
              }
            } catch {
              // Server preferences unavailable — use localStorage
            }
          },
          saveToServer: async () => {
            const s = get();
            const payload = {
              fontSize: s.fontSize,
              fontFamily: s.fontFamily,
              theme: s.theme,
              aiProvider: s.aiProvider,
              aiModel: s.aiModel,
              aiApiKey: s.aiApiKey,
              bedrockAuthMode: s.bedrockAuthMode,
              bedrockRegion: s.bedrockRegion,
              bedrockProfile: s.bedrockProfile,
              bedrockAccessKeyId: s.bedrockAccessKeyId,
              bedrockSecretKey: s.bedrockSecretKey,
              bedrockSessionToken: s.bedrockSessionToken,
              bedrockInferenceProfileArn: s.bedrockInferenceProfileArn,
              ollamaUrl: s.ollamaUrl,
              s3Bucket: s.s3Bucket,
              compactMode: s.compactMode,
              enableEnvBorders: s.enableEnvBorders,
              scrollbackLines: s.scrollbackLines,
              envColors: s.envColors,
              snippets: s.snippets,
            };
            try {
              await fetch('/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
            } catch {
              // Silent fail — localStorage is the fallback
            }
          },
        }),
        {
          name: 'ct-settings',
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
    { name: 'settings' },
  ),
);

// Auto-save to server on any change (debounced 2s)
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useSettingsStore.subscribe(
  (s) => ({
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    theme: s.theme,
    aiProvider: s.aiProvider,
    aiModel: s.aiModel,
    aiApiKey: s.aiApiKey,
    bedrockAuthMode: s.bedrockAuthMode,
    bedrockRegion: s.bedrockRegion,
    bedrockProfile: s.bedrockProfile,
    bedrockAccessKeyId: s.bedrockAccessKeyId,
    bedrockSecretKey: s.bedrockSecretKey,
    bedrockInferenceProfileArn: s.bedrockInferenceProfileArn,
    ollamaUrl: s.ollamaUrl,
    s3Bucket: s.s3Bucket,
    compactMode: s.compactMode,
    enableEnvBorders: s.enableEnvBorders,
    scrollbackLines: s.scrollbackLines,
    envColors: s.envColors,
    snippets: s.snippets,
  }),
  () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void useSettingsStore.getState().saveToServer(); }, 2000);
  },
  { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
);

// Load from server on first import
if (typeof window !== 'undefined') {
  void useSettingsStore.getState().loadFromServer();
}
