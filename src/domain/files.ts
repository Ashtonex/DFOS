import { UPLOAD_LIMITS } from "./rules";

export type FileCheck = { ok: true; mimeType: string } | { ok: false; error: string };

function startsWith(bytes: Uint8Array, sig: number[]) {
  return sig.every((b, i) => bytes[i] === b);
}

/**
 * Validates an upload by size, extension and content signature. The stored
 * MIME type is derived from the verified content, never trusted from the browser.
 */
export function checkUpload(fileName: string, data: ArrayBuffer): FileCheck {
  if (data.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (data.byteLength > UPLOAD_LIMITS.maxBytes)
    return { ok: false, error: `The file is ${(data.byteLength / 1048576).toFixed(1)} MB; the limit is 5 MB.` };
  const ext = (fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const mimeType = Object.entries(UPLOAD_LIMITS.types).find(([, exts]) => exts.includes(ext))?.[0];
  if (!mimeType) return { ok: false, error: "Only PDF, PNG, JPEG or plain-text (.txt) files are accepted." };
  const head = new Uint8Array(data, 0, Math.min(16, data.byteLength));
  const matches =
    (mimeType === "application/pdf" && startsWith(head, [0x25, 0x50, 0x44, 0x46])) ||
    (mimeType === "image/png" && startsWith(head, [0x89, 0x50, 0x4e, 0x47])) ||
    (mimeType === "image/jpeg" && startsWith(head, [0xff, 0xd8, 0xff])) ||
    (mimeType === "text/plain" && !new Uint8Array(data).includes(0));
  if (!matches) return { ok: false, error: `The file content does not match its ${ext} extension.` };
  return { ok: true, mimeType };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
