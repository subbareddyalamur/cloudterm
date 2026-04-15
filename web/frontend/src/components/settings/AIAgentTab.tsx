import { useSettingsStore } from "@/stores/useSettingsStore";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROVIDERS = [
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "ollama", label: "Ollama (Local)" },
] as const;

function providerHint(provider: string): string {
  switch (provider) {
    case "bedrock":
      return "e.g. anthropic.claude-3-5-sonnet-20241022-v2:0";
    case "anthropic":
      return "e.g. claude-sonnet-4-20250514";
    case "openai":
      return "e.g. gpt-4o";
    case "gemini":
      return "e.g. gemini-pro";
    case "ollama":
      return "e.g. llama3";
    default:
      return "";
  }
}

export function AIAgentTab() {
  const aiConfig = useSettingsStore((s) => s.aiConfig);
  const setAIConfig = useSettingsStore((s) => s.setAIConfig);

  const provider = aiConfig.provider;

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-foreground">AI Agent</h3>

      {/* Provider */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Provider</label>
        <Select
          value={provider}
          onValueChange={(v) => setAIConfig({ provider: v })}
        >
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Model Name</label>
        <Input
          value={aiConfig.model}
          onChange={(e) => setAIConfig({ model: e.target.value })}
          placeholder={providerHint(provider)}
          className="h-8 font-mono text-sm"
        />
      </div>

      {/* Bedrock-specific fields */}
      {provider === "bedrock" && (
        <>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Bedrock Region
            </label>
            <Input
              value={aiConfig.bedrockRegion}
              onChange={(e) =>
                setAIConfig({ bedrockRegion: e.target.value })
              }
              placeholder="us-east-1"
              className="h-8 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Bedrock Profile
            </label>
            <Input
              value={aiConfig.bedrockProfile}
              onChange={(e) =>
                setAIConfig({ bedrockProfile: e.target.value })
              }
              placeholder="dev"
              className="h-8 font-mono text-sm"
            />
          </div>
        </>
      )}

      {/* API key fields per provider */}
      {provider === "anthropic" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Anthropic API Key
          </label>
          <Input
            type="password"
            value={aiConfig.anthropicKey}
            onChange={(e) => setAIConfig({ anthropicKey: e.target.value })}
            placeholder="sk-ant-…"
            className="h-8 font-mono text-sm"
          />
        </div>
      )}

      {provider === "openai" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            OpenAI API Key
          </label>
          <Input
            type="password"
            value={aiConfig.openaiKey}
            onChange={(e) => setAIConfig({ openaiKey: e.target.value })}
            placeholder="sk-…"
            className="h-8 font-mono text-sm"
          />
        </div>
      )}

      {provider === "gemini" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Gemini API Key
          </label>
          <Input
            type="password"
            value={aiConfig.geminiKey}
            onChange={(e) => setAIConfig({ geminiKey: e.target.value })}
            placeholder="AI…"
            className="h-8 font-mono text-sm"
          />
        </div>
      )}

      {provider === "ollama" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Ollama URL</label>
          <Input
            value={aiConfig.ollamaUrl}
            onChange={(e) => setAIConfig({ ollamaUrl: e.target.value })}
            placeholder="http://localhost:11434"
            className="h-8 font-mono text-sm"
          />
        </div>
      )}

      {/* Max tokens */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Max Tokens</label>
        <Input
          type="number"
          min={256}
          max={128000}
          value={aiConfig.maxTokens}
          onChange={(e) =>
            setAIConfig({ maxTokens: Number(e.target.value) || 4096 })
          }
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
