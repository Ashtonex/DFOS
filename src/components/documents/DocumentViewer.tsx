"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import * as repo from "@/data/repository";
import { errorMessage } from "@/data/errors";
import { formatBytes } from "@/domain/files";
import type { ShipmentDocument } from "@/domain/types";
import { useViewer } from "@/lib/hooks";
import { Alert, LoadingBlock, Modal } from "../ui";

type Loaded = { url: string; mimeType: string; text: string | null };

/**
 * Opens a stored document. Content type comes from the verified file signature;
 * text is rendered as text (never HTML), images in <img>, PDFs in the browser's viewer.
 */
export function DocumentViewer({ doc, onClose }: { doc: ShipmentDocument | null; onClose: () => void }) {
  const { viewer } = useViewer();
  const [state, setState] = useState<{ docId: string; loaded?: Loaded; error?: string } | null>(null);

  useEffect(() => {
    if (!doc || !viewer) return;
    let url: string | null = null;
    let cancelled = false;
    repo
      .getDocumentFile(viewer, doc.id)
      .then(({ data, mimeType }) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([data], { type: mimeType }));
        const text = mimeType === "text/plain" ? new TextDecoder().decode(data) : null;
        setState({ docId: doc.id, loaded: { url, mimeType, text } });
      })
      .catch((e) => !cancelled && setState({ docId: doc.id, error: errorMessage(e) }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, viewer]);

  const current = state && doc && state.docId === doc.id ? state : null;
  return (
    <Modal open={!!doc} onClose={onClose} title={doc?.fileName ?? "Document"} wide>
      {doc && (
        <div className="space-y-3" data-testid="document-viewer">
          <p className="text-xs text-slate-500">
            {doc.mimeType} · {formatBytes(doc.size)}
          </p>
          {!current ? (
            <LoadingBlock label="Opening document…" rows={3} />
          ) : current.error ? (
            <Alert tone="danger" title="Could not open this document">
              {current.error}
            </Alert>
          ) : current.loaded ? (
            <>
              {current.loaded.text !== null ? (
                <pre className="max-h-[50vh] overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap" data-testid="document-text">
                  {current.loaded.text}
                </pre>
              ) : current.loaded.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.loaded.url} alt={doc.fileName} className="max-h-[60vh] max-w-full rounded border border-slate-200" />
              ) : (
                // Only signature-verified PDFs reach this branch; the browser's PDF viewer renders them.
                <iframe src={current.loaded.url} title={doc.fileName} className="h-[60vh] w-full rounded border border-slate-200" />
              )}
              <a
                href={current.loaded.url}
                download={doc.fileName}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                data-testid="document-download"
              >
                <Download className="size-4" aria-hidden /> Download
              </a>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
