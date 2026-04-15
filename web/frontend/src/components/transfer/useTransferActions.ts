import { useCallback } from "react";
import { useTransferStore, type TransferStatus } from "@/stores/useTransferStore";
import type { NDJSONCallback } from "@/lib/api";
import type { TransferProgress } from "@/types/transfers";

/**
 * Returns helpers for starting transfers and creating NDJSON progress callbacks
 * that automatically feed into the transfer store.
 */
export function useTransferActions() {
  const addTransfer = useTransferStore((s) => s.add);
  const updateTransfer = useTransferStore((s) => s.update);

  /** Create an NDJSON progress callback bound to a transfer ID. */
  const makeProgressCb = useCallback(
    (tid: number): NDJSONCallback<TransferProgress> => {
      return (msg) => {
        let status: TransferStatus = "active";
        let progress = msg.progress ?? 0;

        if (msg.status === "error") {
          status = "error";
          progress = msg.progress ?? 100;
        } else if (msg.status === "complete") {
          status = "complete";
          progress = 100;
        }

        updateTransfer(
          tid,
          progress,
          msg.status === "complete" ? "Complete" : (msg.message ?? ""),
          status
        );
      };
    },
    [updateTransfer]
  );

  return { addTransfer, updateTransfer, makeProgressCb };
}
