import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultRuleType =
  | "instance"
  | "substring"
  | "env"
  | "account"
  | "global";

export interface VaultRule {
  type: VaultRuleType;
  value: string;
  label: string;
}

export interface RdpCredentials {
  username: string;
  password: string;
  security: string;
  record: boolean;
  /** If set, the caller should persist to /vault/credentials. */
  vaultRule?: VaultRule;
}

export interface RdpCredentialModalProps {
  open: boolean;
  instanceId: string;
  instanceName: string;
  defaults?: Partial<RdpCredentials>;
  onConnect: (creds: RdpCredentials) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Vault rule placeholder helper
// ---------------------------------------------------------------------------

const VAULT_PLACEHOLDERS: Record<VaultRuleType, string> = {
  instance: "",
  substring: "Substring (e.g. windows, guacamole)",
  env: "Environment (e.g. production)",
  account: "AWS Account ID",
  global: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RdpCredentialModal({
  open,
  instanceId,
  instanceName,
  defaults,
  onConnect,
  onCancel,
}: RdpCredentialModalProps) {
  const [username, setUsername] = useState(defaults?.username ?? "Administrator");
  const [password, setPassword] = useState(defaults?.password ?? "");
  const [security, setSecurity] = useState(defaults?.security ?? "any");
  const [record, setRecord] = useState(defaults?.record ?? false);
  const [showPass, setShowPass] = useState(false);

  // Vault
  const [saveVault, setSaveVault] = useState(false);
  const [vaultType, setVaultType] = useState<VaultRuleType>("instance");
  const [vaultValue, setVaultValue] = useState(instanceId);
  const [vaultLabel, setVaultLabel] = useState("");

  const handleVaultTypeChange = useCallback(
    (t: VaultRuleType) => {
      setVaultType(t);
      if (t === "instance") setVaultValue(instanceId);
      else if (t === "global") setVaultValue("*");
      else setVaultValue("");
    },
    [instanceId],
  );

  const submit = useCallback(() => {
    const creds: RdpCredentials = {
      username: username.trim(),
      password,
      security,
      record,
    };
    if (saveVault) {
      creds.vaultRule = {
        type: vaultType,
        value: vaultValue,
        label: vaultLabel || `${username.trim()} @ ${instanceName}`,
      };
    }
    onConnect(creds);
  }, [
    username,
    password,
    security,
    record,
    saveVault,
    vaultType,
    vaultValue,
    vaultLabel,
    instanceName,
    onConnect,
  ]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>RDP Credentials</DialogTitle>
          <DialogDescription>
            {instanceName} ({instanceId})
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Username */}
          <Input
            placeholder="Username (e.g. Administrator)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />

          {/* Password */}
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPass((p) => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              {showPass ? "Hide" : "Show"}
            </button>
          </div>

          {/* Security */}
          <select
            value={security}
            onChange={(e) => setSecurity(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="any">Security: Any</option>
            <option value="nla">Security: NLA</option>
            <option value="tls">Security: TLS</option>
            <option value="rdp">Security: RDP</option>
          </select>

          {/* Record */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={record}
              onChange={(e) => setRecord(e.target.checked)}
              className="accent-red-500"
            />
            <span>🔴 Record session</span>
          </label>

          {/* Save to Vault */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveVault}
              onChange={(e) => setSaveVault(e.target.checked)}
              className="accent-emerald-500"
            />
            <span>🔐 Save to Vault</span>
          </label>

          {saveVault && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
              <select
                value={vaultType}
                onChange={(e) =>
                  handleVaultTypeChange(e.target.value as VaultRuleType)
                }
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="instance">Match: This Instance</option>
                <option value="substring">Match: Name Substring</option>
                <option value="env">Match: Environment</option>
                <option value="account">Match: AWS Account</option>
                <option value="global">Match: Global (all)</option>
              </select>

              {vaultType !== "instance" && vaultType !== "global" && (
                <Input
                  placeholder={VAULT_PLACEHOLDERS[vaultType]}
                  value={vaultValue}
                  onChange={(e) => setVaultValue(e.target.value)}
                />
              )}

              <Input
                placeholder="Label (e.g. Dev Windows)"
                value={vaultLabel}
                onChange={(e) => setVaultLabel(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit}>Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
