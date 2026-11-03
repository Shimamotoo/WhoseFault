import React, { useCallback, useEffect, useState } from "react";
import type { Evidence } from "@/types/domain";
import { fetchEvidenceImageBlob } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ExternalLink,
  ImageIcon,
  RefreshCw,
  ZoomIn,
} from "lucide-react";

interface EvidenceImagePreviewProps {
  occurrenceId: string;
  evidence: Evidence;
}

function formatBytes(raw?: string): string | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export const EvidenceImagePreview: React.FC<EvidenceImagePreviewProps> = ({
  occurrenceId,
  evidence,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const filename = evidence.headers?.filename ?? "captura-de-tela";
  const contentType = evidence.headers?.contentType ?? "image/*";
  const formattedSize = formatBytes(evidence.headers?.sizeBytes);

  const handleRetry = useCallback(() => {
    setReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let createdObjectUrl: string | null = null;

    setIsLoading(true);
    setLoadError(null);

    fetchEvidenceImageBlob(occurrenceId, evidence.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        createdObjectUrl = URL.createObjectURL(blob);
        setImageUrl(createdObjectUrl);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a imagem do storage.",
        );
        setIsLoading(false);
      });

    return () => {
      controller.abort();
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [occurrenceId, evidence.id, reloadKey]);

  return (
    <div className="space-y-3" data-testid={`evidence-image-card-${evidence.id}`}>
      {/* Metadados técnicos da imagem */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0 font-mono text-xs text-zinc-300">
          <ImageIcon className="h-3.5 w-3.5 text-teal-400 shrink-0" />
          <span className="truncate font-medium text-zinc-100">{filename}</span>
          <span className="text-zinc-500">•</span>
          <span className="text-[11px] text-zinc-400">{contentType}</span>
          {formattedSize && (
            <>
              <span className="text-zinc-500">•</span>
              <span className="text-[11px] text-zinc-400">{formattedSize}</span>
            </>
          )}
        </div>

        {imageUrl && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setZoomOpen(true)}
              data-testid={`btn-zoom-image-${evidence.id}`}
              className="h-7 px-2.5 text-xs"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Ampliar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                window.open(imageUrl, "_blank", "noopener,noreferrer")
              }
              className="h-7 px-2 text-xs text-zinc-300"
              title="Abrir imagem em nova aba"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Área da miniatura */}
      {isLoading ? (
        <Skeleton className="h-52 w-full rounded-md bg-zinc-900/80" />
      ) : loadError ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="h-7 text-xs shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Tentar novamente
          </Button>
        </div>
      ) : imageUrl ? (
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="group relative block w-full overflow-hidden rounded-md border border-zinc-800/90 bg-zinc-900/60 p-2 text-left transition hover:border-teal-500/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400"
        >
          <img
            src={imageUrl}
            alt={evidence.notes || filename}
            className="mx-auto max-h-72 w-auto rounded object-contain transition-transform duration-200 group-hover:scale-[1.01]"
          />
          <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded bg-zinc-950/85 px-2.5 py-1 font-mono text-[11px] text-zinc-200 opacity-0 shadow transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3.5 w-3.5 text-teal-400" />
            Clique para ampliar
          </div>
        </button>
      ) : null}

      {/* Notas descritivas opcionais */}
      {evidence.notes && (
        <div className="space-y-1">
          <div className="text-[10px] font-mono uppercase text-zinc-500">
            Contexto / Observações da Captura
          </div>
          <p className="rounded border border-zinc-800/60 bg-zinc-900/40 p-2.5 text-xs text-zinc-300 whitespace-pre-wrap">
            {evidence.notes}
          </p>
        </div>
      )}

      {/* Modal de visualização em alta resolução (Zoom) */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm text-zinc-100">
              {filename}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              {evidence.notes || "Evidência visual anexada à ocorrência"}
            </DialogDescription>
          </DialogHeader>
          {imageUrl && (
            <div className="flex items-center justify-center rounded border border-zinc-800 bg-zinc-900/50 p-2">
              <img
                src={imageUrl}
                alt={evidence.notes || filename}
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
