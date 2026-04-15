import { useCallback, useRef, useState } from "react";
import { Upload, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTransferStore } from "@/stores/useTransferStore";
import {
  uploadFile,
  expressUpload,
  type NDJSONCallback,
} from "@/lib/api";
import type { TransferProgress } from "@/types/transfers";

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

interface UploadDialogProps {
  instanceId: string;
  instanceName: string;
  platform?: string;
  awsProfile?: string;
  awsRegion?: string;
}

export function UploadDialog({
  instanceId,
  instanceName,
  platform = "linux",
  awsProfile = "",
  awsRegion = "",
}: UploadDialogProps) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);
  const addTransfer = useTransferStore((s) => s.add);
  const updateTransfer = useTransferStore((s) => s.update);

  const [file, setFile] = useState<File | null>(null);
  const [remotePath, setRemotePath] = useState("");
  const [useExpress, setUseExpress] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isWindows = platform === "windows";
  const open = activeModal === "upload";

  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      if (!remotePath) {
        setRemotePath(
          isWindows ? `C:\\Windows\\Temp\\${f.name}` : `/tmp/${f.name}`
        );
      } else if (remotePath.endsWith("/") || remotePath.endsWith("\\")) {
        setRemotePath(remotePath + f.name);
      }
    },
    [remotePath, isWindows]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!file || !remotePath) return;

    closeModal();

    const tid = addTransfer("upload", file.name, useExpress);

    const onProgress: NDJSONCallback<TransferProgress> = (msg) => {
      if (msg.status === "error") {
        updateTransfer(tid, msg.progress ?? 100, msg.message, "error");
      } else if (msg.status === "complete") {
        updateTransfer(tid, 100, "Complete", "complete");
      } else {
        updateTransfer(tid, msg.progress ?? 0, msg.message ?? "", "active");
      }
    };

    const form = new FormData();
    form.append("file", file);
    form.append("instance_id", instanceId);
    form.append("remote_path", remotePath);
    form.append("platform", platform);
    form.append("aws_profile", awsProfile);
    form.append("aws_region", awsRegion);

    if (useExpress) {
      form.append("s3_bucket", s3Bucket);
    }

    try {
      if (useExpress) {
        await expressUpload(form, onProgress);
      } else {
        await uploadFile(form, onProgress);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      updateTransfer(tid, 0, msg, "error");
    }

    // Reset form state
    setFile(null);
    setRemotePath("");
    setUseExpress(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
      setFile(null);
      setRemotePath("");
      setUseExpress(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Upload to {instanceName}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({instanceId})
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground"
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop a file here or click to browse
          </p>
          {file && (
            <p className="text-xs font-medium">
              {file.name} ({formatSize(file.size)})
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFile(e.target.files[0]);
            }}
          />
        </div>

        {/* Remote path */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Remote Path</label>
          <Input
            className="text-xs"
            placeholder={
              isWindows
                ? "C:\\Windows\\Temp\\myfile.txt"
                : "/tmp/myfile.txt"
            }
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
          />
        </div>

        {/* Express toggle */}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={useExpress}
            onChange={(e) => setUseExpress(e.target.checked)}
            className="size-3.5 rounded border-border"
          />
          <Zap className="size-3.5 text-amber-400" />
          Express Upload (via S3)
          {useExpress && !s3Bucket && (
            <span className="text-destructive">— configure S3 bucket in Settings</span>
          )}
        </label>

        <DialogFooter>
          <Button
            size="sm"
            disabled={!file || !remotePath || (useExpress && !s3Bucket)}
            onClick={handleSubmit}
          >
            {useExpress ? "⚡ Express Upload" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
