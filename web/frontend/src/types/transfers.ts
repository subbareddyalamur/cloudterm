/** NDJSON progress event emitted during file uploads/downloads. */
export interface TransferProgress {
  progress: number;
  message: string;
  status: "progress" | "complete" | "error";
}

/** Directory entry returned by POST /browse-directory. */
export interface FileEntry {
  name: string;
  size: number;
  is_dir: boolean;
  modified?: string;
  permissions?: string;
}
