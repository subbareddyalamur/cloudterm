import { useState, useMemo } from "react";
import {
  Settings,
  Palette,
  Cloud,
  Bot,
  Lock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GeneralTab } from "./GeneralTab";
import { AppearanceTab } from "./AppearanceTab";
import { AWSAccountsTab } from "./AWSAccountsTab";
import { AIAgentTab } from "./AIAgentTab";
import { VaultTab } from "./VaultTab";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useUIStore } from "@/stores/useUIStore";

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "aws", label: "AWS Accounts", icon: Cloud },
  { id: "ai", label: "AI Agent", icon: Bot },
  { id: "vault", label: "Credential Vault", icon: Lock },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const openModal = useUIStore((s) => s.openModal);

  // Ctrl+, shortcut to open settings
  const shortcuts = useMemo(
    () => [
      {
        key: ",",
        ctrl: true,
        handler: () => {
          openModal("settings");
        },
        description: "Open settings",
        group: "General",
      },
    ],
    [openModal],
  );
  useShortcuts(shortcuts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[70vh] max-h-[600px] w-full max-w-3xl gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        {/* ── Vertical sidebar ── */}
        <nav className="flex w-48 shrink-0 flex-col border-r border-border bg-[var(--s1)]">
          <h2 className="px-4 py-3 text-sm font-semibold text-foreground">
            Settings
          </h2>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                  activeTab === tab.id
                    ? "bg-[var(--s2)] text-foreground"
                    : "text-muted-foreground hover:bg-[var(--s2)] hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* ── Tab content ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "aws" && <AWSAccountsTab />}
          {activeTab === "ai" && <AIAgentTab />}
          {activeTab === "vault" && <VaultTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
