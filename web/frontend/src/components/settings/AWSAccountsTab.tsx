import { useState, useEffect, useCallback } from "react";
import { Trash2, RefreshCw, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listAWSAccounts,
  addAWSAccount,
  deleteAWSAccount,
  scanAWSAccount,
} from "@/lib/api";
import type { ManualAccount } from "@/types";

export function AWSAccountsTab() {
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state
  const [alias, setAlias] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAWSAccounts();
      setAccounts(list ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!alias.trim() || !accessKey.trim() || !secretKey.trim()) return;
    setAdding(true);
    try {
      await addAWSAccount({
        name: alias.trim(),
        access_key_id: accessKey.trim(),
        secret_access_key: secretKey.trim(),
        session_token: sessionToken.trim() || undefined,
      });
      setAlias("");
      setAccessKey("");
      setSecretKey("");
      setSessionToken("");
      await refresh();
    } catch {
      // silently fail
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAWSAccount(id);
      setConfirmDelete(null);
      await refresh();
    } catch {
      // silently fail
    }
  };

  const handleScan = async (id: string) => {
    setScanningId(id);
    try {
      await scanAWSAccount(id);
    } catch {
      // silently fail
    } finally {
      setScanningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-foreground">AWS Accounts</h3>

      {/* Existing accounts */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No AWS accounts configured. Add one below.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((acct) => (
            <div
              key={acct.id}
              className="flex items-center gap-3 rounded bg-[var(--s2)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {acct.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {acct.access_key_id.slice(0, 8)}…
                  {acct.id ? ` · ${acct.id}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={scanningId === acct.id}
                onClick={() => handleScan(acct.id)}
                title="Scan account"
              >
                <RefreshCw
                  className={`size-3.5 ${scanningId === acct.id ? "animate-spin" : ""}`}
                />
              </Button>
              {confirmDelete === acct.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleDelete(acct.id)}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setConfirmDelete(acct.id)}
                  title="Delete account"
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-red-400" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add account form */}
      <div className="space-y-3 rounded border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">
          Add AWS Account
        </p>
        <Input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Alias (e.g. production)"
          className="h-8 text-sm"
        />
        <Input
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          placeholder="Access Key ID"
          className="h-8 font-mono text-sm"
        />
        <Input
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder="Secret Access Key"
          className="h-8 font-mono text-sm"
        />
        <Input
          type="password"
          value={sessionToken}
          onChange={(e) => setSessionToken(e.target.value)}
          placeholder="Session Token (optional)"
          className="h-8 font-mono text-sm"
        />
        <Button
          size="sm"
          disabled={adding || !alias.trim() || !accessKey.trim() || !secretKey.trim()}
          onClick={handleAdd}
          className="h-8"
        >
          {adding ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Plus className="mr-1 size-3" />
          )}
          Add Account
        </Button>
      </div>
    </div>
  );
}
