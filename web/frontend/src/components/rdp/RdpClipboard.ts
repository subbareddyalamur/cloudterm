/**
 * RDP clipboard sync helpers.
 *
 * Handles bidirectional clipboard transfer between the local browser
 * and the remote RDP session via the Guacamole protocol.
 */

import Guacamole from "guacamole-common-js";

/** Read remote clipboard data from a Guacamole clipboard stream (text/plain). */
export function readRemoteClipboard(
  stream: Guacamole.InputStream,
  onText: (text: string) => void,
): void {
  const chunks: string[] = [];
  stream.onblob = (blob: string) => {
    chunks.push(blob);
  };
  stream.onend = () => {
    try {
      const binary = atob(chunks.join(""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      onText(new TextDecoder("utf-8").decode(bytes));
    } catch {
      // Decode failure — ignore
    }
  };
}

/** Push local text to the remote RDP clipboard via Guacamole. */
export function pushClipboardToRemote(
  client: Guacamole.Client,
  text: string,
): void {
  if (!text) return;
  try {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const stream = client.createClipboardStream("text/plain");
    stream.sendBlob(btoa(binary));
    stream.sendEnd();
  } catch {
    // Stream creation may fail if disconnected
  }
}

/** Try to write text to the browser's clipboard (async, may be denied). */
export async function writeLocalClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && document.hasFocus()) {
    await navigator.clipboard.writeText(text).catch(() => {});
  }
}

/** Try to read text from the browser's clipboard (async, may be denied). */
export async function readLocalClipboard(): Promise<string> {
  if (navigator.clipboard?.readText && document.hasFocus()) {
    return navigator.clipboard.readText().catch(() => "");
  }
  return "";
}
