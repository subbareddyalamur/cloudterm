import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { api } from '@/lib/api';

const PROVIDER_LABELS: Record<string, string> = {
  bedrock: 'AWS Bedrock',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

const PROVIDER_SHORT: Record<string, string> = {
  bedrock: 'BEDROCK',
  anthropic: 'ANTHROPIC',
  openai: 'OPENAI',
  gemini: 'GEMINI',
  ollama: 'OLLAMA',
};

const PROVIDER_COLORS: Record<string, string> = {
  bedrock: 'bg-warn/15 text-warn',
  anthropic: 'bg-accent/15 text-accent',
  openai: 'bg-success/15 text-success',
  gemini: 'bg-info/15 text-info',
  ollama: 'bg-[var(--elev)] text-text-mut',
};

export function ProviderSelector({ className = '' }: { className?: string }) {
  const provider = useSettingsStore((s) => s.aiProvider);
  const model = useSettingsStore((s) => s.aiModel);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  const fetchModels = useCallback((prov: string) => {
    setLoading(true);
    const params = new URLSearchParams({ provider: prov });
    const st = useSettingsStore.getState();
    if (prov === 'bedrock') {
      params.set('region', st.bedrockRegion);
      params.set('auth_mode', st.bedrockAuthMode);
      params.set('profile', st.bedrockProfile);
    }
    if (prov === 'ollama') params.set('ollama_url', st.ollamaUrl);
    if (st.aiApiKey && (prov === 'anthropic' || prov === 'openai' || prov === 'gemini')) {
      params.set('api_key', st.aiApiKey);
    }
    api.get<Array<{ id: string; name: string }>>(`/ai-agent/models?${params.toString()}`).then((r) => {
      if (r.ok && Array.isArray(r.data)) setModels(r.data);
      else setModels([]);
      setLoading(false);
    }).catch(() => { setModels([]); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchModels(provider);
  }, [provider, fetchModels]);

  const shortModel = model.split('/').pop()?.split(':')[0] ?? model;

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      {/* Provider select */}
      <div className="relative shrink-0">
        <select
          value={provider}
          onChange={(e) => useSettingsStore.setState({ aiProvider: e.target.value, aiModel: '' })}
          className={`appearance-none text-[11px] font-semibold px-1.5 py-0.5 pr-4 rounded cursor-pointer focus:outline-none transition-colors ${PROVIDER_COLORS[provider] ?? 'bg-[var(--elev)] text-text-mut'}`}
          aria-label="Select AI provider"
        >
          {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
      </div>

      <span className="text-text-dim text-[10px] shrink-0">·</span>

      {/* Model select / display */}
      <div className="relative min-w-0 flex-1">
        {models.length > 0 ? (
          <>
            <select
              value={model}
              onChange={(e) => useSettingsStore.setState({ aiModel: e.target.value })}
              className="appearance-none bg-transparent text-[11px] text-text-mut pr-4 cursor-pointer focus:outline-none hover:text-text-pri transition-colors w-full truncate"
              aria-label="Select AI model"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown size={9} className="absolute right-0 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
          </>
        ) : (
          <span className="text-[11px] text-text-dim truncate block">{loading ? '…' : shortModel || 'No model'}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => fetchModels(provider)}
        className="text-text-dim hover:text-text-pri transition-colors p-0.5 shrink-0"
        aria-label="Refresh models"
        title="Refresh models"
      >
        <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

ProviderSelector.displayName = 'ProviderSelector';
