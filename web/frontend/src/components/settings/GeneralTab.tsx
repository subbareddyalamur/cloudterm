import { useSettingsStore } from "@/stores/useSettingsStore";
import { Input } from "@/components/ui/input";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-[var(--dim)]"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </label>
  );
}

export function GeneralTab() {
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);
  const setS3Bucket = useSettingsStore((s) => s.setS3Bucket);
  const syncToBackend = useSettingsStore((s) => s.syncToBackend);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-sm font-semibold text-foreground">General</h3>
        <div className="space-y-4">
          {/* S3 Bucket */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              S3 Bucket Name
            </label>
            <Input
              value={s3Bucket}
              onChange={(e) => setS3Bucket(e.target.value)}
              onBlur={syncToBackend}
              placeholder="my-recordings-bucket"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Used for recording uploads and file transfers
            </p>
          </div>

          {/* Auto-recording */}
          <Toggle
            label="Auto-record sessions"
            checked={
              localStorage.getItem("cloudterm_auto_record") === "true"
            }
            onChange={(v) => {
              localStorage.setItem(
                "cloudterm_auto_record",
                v ? "true" : "false",
              );
            }}
          />

          {/* Suggestions */}
          <Toggle
            label="AI suggestions"
            checked={
              localStorage.getItem("cloudterm_suggestions") !== "false"
            }
            onChange={(v) => {
              localStorage.setItem(
                "cloudterm_suggestions",
                v ? "true" : "false",
              );
            }}
          />

          {/* Error analysis */}
          <Toggle
            label="Error analysis"
            checked={
              localStorage.getItem("cloudterm_error_analysis") !== "false"
            }
            onChange={(v) => {
              localStorage.setItem(
                "cloudterm_error_analysis",
                v ? "true" : "false",
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
