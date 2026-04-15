import { Download, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransferStore } from "@/stores/useTransferStore";
import {
  downloadFile,
  expressDownload,
  type NDJSONCallback,
} from "@/lib/api";
import type { TransferProgress } from "@/types/transfers";

interface DownloadButtonProps {
  instanceId: string;
  instanceName?: string;
  remotePath: string;
  awsProfile?: string;
  awsRegion?: string;
  /** Use Express (S3) download instead of regular SCP. */
  express?: boolean;
  /** S3 bucket — required when express is true. */
  s3Bucket?: string;
  /** Render as icon-only button. */
  iconOnly?: boolean;
  className?: string;
}

export function DownloadButton({
  instanceId,
  instanceName = instanceId,
  remotePath,
  awsProfile = "",
  awsRegion = "",
  express = false,
  s3Bucket = "",
  iconOnly = false,
  className,
}: DownloadButtonProps) {
  const addTransfer = useTransferStore((s) => s.add);
  const updateTransfer = useTransferStore((s) => s.update);

  const filename =
    remotePath.split("/").pop()?.split("\\").pop() || "download";

  const handleClick = async () => {
    const tid = addTransfer("download", filename, express);

    const onProgress: NDJSONCallback<TransferProgress> = (msg) => {
      if (msg.status === "error") {
        updateTransfer(tid, msg.progress ?? 100, msg.message, "error");
      } else if (msg.status === "complete") {
        // For regular downloads the NDJSON `complete` message may contain
        // base64-encoded file data.  The api helper already handles the
        // streaming; we just mark the transfer done.
        updateTransfer(tid, 100, "Complete", "complete");
      } else {
        updateTransfer(tid, msg.progress ?? 0, msg.message ?? "", "active");
      }
    };

    try {
      if (express) {
        await expressDownload(
          {
            instance_id: instanceId,
            remote_path: remotePath,
            aws_profile: awsProfile,
            aws_region: awsRegion,
            ...(s3Bucket ? { s3_bucket: s3Bucket } : {}),
          } as Parameters<typeof expressDownload>[0],
          onProgress
        );
      } else {
        await downloadFile(
          {
            instance_id: instanceId,
            instance_name: instanceName,
            remote_path: remotePath,
            aws_profile: awsProfile,
            aws_region: awsRegion,
          },
          onProgress
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Download failed";
      updateTransfer(tid, 0, msg, "error");
    }
  };

  if (iconOnly) {
    return (
      <button
        className={className ?? "text-muted-foreground hover:text-foreground"}
        title={express ? "Express Download" : "Download"}
        onClick={handleClick}
      >
        {express ? (
          <Zap className="size-3.5 text-amber-400" />
        ) : (
          <Download className="size-3.5" />
        )}
      </button>
    );
  }

  return (
    <Button size="sm" variant="outline" className={className} onClick={handleClick}>
      {express ? (
        <>
          <Zap className="mr-1 size-3.5 text-amber-400" />
          Express Download
        </>
      ) : (
        <>
          <Download className="mr-1 size-3.5" />
          Download
        </>
      )}
    </Button>
  );
}
