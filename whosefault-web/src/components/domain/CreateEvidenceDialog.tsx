import React, { useEffect, useRef, useState } from "react";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  EVIDENCE_TYPES,
  HTTP_METHODS,
  MAX_IMAGES_PER_OCCURRENCE,
  MAX_IMAGE_SIZE_BYTES,
  type EvidenceType,
  type HttpMethod,
} from "@/types/domain";
import { useOccurrences } from "@/context/OccurrencesContext";
import { ApiError } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ImagePlus,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateEvidenceDialogProps {
  occurrenceId: string;
  defaultMethod?: HttpMethod;
  defaultUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const CreateEvidenceDialog: React.FC<CreateEvidenceDialogProps> = ({
  occurrenceId,
  defaultMethod = "POST",
  defaultUrl = "",
  open,
  onOpenChange,
}) => {
  const { addEvidence, evidencesByOccurrence } = useOccurrences();
  const [type, setType] = useState<EvidenceType>("HTTP_REQUEST");
  const [method, setMethod] = useState<HttpMethod>(defaultMethod);
  const [url, setUrl] = useState(defaultUrl);
  const [statusCode, setStatusCode] = useState("500");
  const [headersText, setHeadersText] = useState(
    '{\n  "Content-Type": "application/json"\n}',
  );
  const [payload, setPayload] = useState("");
  const [body, setBody] = useState("");
  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [secretAlert, setSecretAlert] = useState<{
    message: string;
    guidance?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingImageCount = (evidencesByOccurrence[occurrenceId] ?? []).filter(
    (ev) => ev.type === "IMAGE",
  ).length;
  const isImageLimitReached = existingImageCount >= MAX_IMAGES_PER_OCCURRENCE;

  useEffect(() => {
    if (open) {
      setMethod(defaultMethod);
      setUrl(defaultUrl);
      setError(null);
      setSecretAlert(null);
      setIsDragging(false);
    }
  }, [open, defaultMethod, defaultUrl]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const handleSelectFile = (file: File | undefined | null) => {
    setError(null);
    setSecretAlert(null);

    if (!file) {
      return;
    }

    if (
      !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(
        file.type.toLowerCase(),
      )
    ) {
      setError(
        "Formato de arquivo inválido. Apenas imagens JPEG, PNG e WEBP são permitidas.",
      );
      return;
    }

    if (file.size === 0) {
      setError("O arquivo selecionado está vazio.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(
        `A imagem selecionada (${formatFileSize(file.size)}) excede o limite máximo de 5MB.`,
      );
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isImageLimitReached || isSubmitting) return;
    const droppedFile = e.dataTransfer.files?.[0];
    handleSelectFile(droppedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSecretAlert(null);

    let parsedHeaders: Record<string, string> | undefined;
    if (
      (type === "HTTP_REQUEST" || type === "HTTP_RESPONSE") &&
      headersText.trim() !== ""
    ) {
      try {
        const obj = JSON.parse(headersText);
        if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
          setError("Os cabeçalhos devem ser um objeto JSON chave-valor.");
          return;
        }
        parsedHeaders = obj as Record<string, string>;
      } catch {
        setError("Formato JSON inválido nos cabeçalhos HTTP.");
        return;
      }
    }

    if (type === "HTTP_REQUEST") {
      if (!url.trim()) {
        setError("URL é obrigatória para evidência de Requisição HTTP.");
        return;
      }
      try {
        const u = new URL(url.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          setError("A URL deve utilizar HTTP ou HTTPS.");
          return;
        }
      } catch {
        setError("A URL da requisição deve ser absoluta e válida.");
        return;
      }
    } else if (type === "HTTP_RESPONSE") {
      const code = Number(statusCode);
      if (!Number.isInteger(code) || code < 100 || code > 599) {
        setError("Status HTTP deve ser um número inteiro entre 100 e 599.");
        return;
      }
    } else if (type === "ERROR_LOG" || type === "MANUAL_NOTE") {
      if (!content.trim()) {
        setError(
          "O conteúdo textual é obrigatório para este tipo de evidência.",
        );
        return;
      }
    } else if (type === "IMAGE") {
      if (isImageLimitReached) {
        setError(
          `Limite máximo de ${MAX_IMAGES_PER_OCCURRENCE} fotos por ocorrência já foi atingido.`,
        );
        return;
      }
      if (!selectedFile) {
        setError("Selecione ou arraste uma imagem (JPEG, PNG ou WEBP) para enviar.");
        return;
      }
      if (notes.length > 2000) {
        setError("As observações da imagem não podem exceder 2000 caracteres.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await addEvidence({
        occurrenceId,
        type,
        method: type === "HTTP_REQUEST" ? method : undefined,
        url: type === "HTTP_REQUEST" ? url.trim() : undefined,
        statusCode: type === "HTTP_RESPONSE" ? Number(statusCode) : undefined,
        headers: parsedHeaders,
        payload:
          type === "HTTP_REQUEST" && payload.trim() ? payload : undefined,
        body: type === "HTTP_RESPONSE" && body.trim() ? body : undefined,
        content:
          (type === "ERROR_LOG" || type === "MANUAL_NOTE") && content.trim()
            ? content
            : undefined,
        context: type === "ERROR_LOG" && context.trim() ? context : undefined,
        notes:
          (type === "HTTP_REQUEST" ||
            type === "HTTP_RESPONSE" ||
            type === "IMAGE") &&
          notes.trim()
            ? notes
            : undefined,
        file: type === "IMAGE" && selectedFile ? selectedFile : undefined,
      });

      setPayload("");
      setBody("");
      setContent("");
      setContext("");
      setNotes("");
      handleRemoveSelectedFile();
      onOpenChange(false);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 422 || Boolean(err.guidance))
      ) {
        setSecretAlert({
          message: err.message,
          guidance: err.guidance,
        });
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível salvar a evidência na API.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Evidência Técnica</DialogTitle>
          <DialogDescription>
            Adicione dados estruturados, logs ou capturas de tela à investigação. O sistema verifica padrões de segredos antes de persistir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-1">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {secretAlert && (
            <div
              data-testid="secret-guard-alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-1.5"
            >
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Bloqueio de Segurança: Possível Segredo Detectado</span>
              </div>
              <p className="text-amber-200/90 leading-relaxed">
                {secretAlert.message}
              </p>
              {secretAlert.guidance && (
                <p className="text-amber-200/80 leading-relaxed">
                  {secretAlert.guidance}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Tipo de Evidência <span className="text-rose-400">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as EvidenceType);
                setError(null);
                setSecretAlert(null);
              }}
              data-testid="evidence-type-select"
              className="flex h-8 w-full rounded-md border border-input bg-zinc-950 px-2.5 py-1 font-mono text-xs text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t} className="bg-zinc-950 font-mono">
                  {t === "HTTP_REQUEST" && "HTTP_REQUEST — Requisição HTTP"}
                  {t === "HTTP_RESPONSE" && "HTTP_RESPONSE — Resposta HTTP"}
                  {t === "ERROR_LOG" && "ERROR_LOG — Log ou Mensagem de Erro"}
                  {t === "MANUAL_NOTE" && "MANUAL_NOTE — Observação Manual"}
                  {t === "IMAGE" &&
                    `IMAGE — Imagem / Captura de Tela (${existingImageCount}/${MAX_IMAGES_PER_OCCURRENCE})`}
                </option>
              ))}
            </select>
          </div>

          {type === "HTTP_REQUEST" && (
            <>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Método <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as HttpMethod)}
                    className="flex h-8 w-full rounded-md border border-input bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    URL da Requisição <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    className="font-mono"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.exemplo.com/v1/endpoint"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Cabeçalhos HTTP (JSON)
                </label>
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Payload / Corpo Enviado
                </label>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  placeholder='{"event": "subscription.updated"}'
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Observações Complementares
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contexto opcional sobre o envio desta requisição..."
                />
              </div>
            </>
          )}

          {type === "HTTP_RESPONSE" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Status HTTP <span className="text-rose-400">*</span>
                </label>
                <Input
                  type="number"
                  min={100}
                  max={599}
                  className="font-mono w-32"
                  value={statusCode}
                  onChange={(e) => setStatusCode(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Cabeçalhos da Resposta (JSON)
                </label>
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Corpo da Resposta (Body)
                </label>
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  placeholder='{"error": {"code": "internal_error"}}'
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Observações Complementares
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Retornado após timeout de 30s do gateway..."
                />
              </div>
            </>
          )}

          {type === "ERROR_LOG" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Conteúdo do Log ou Stack Trace <span className="text-rose-400">*</span>
                </label>
                <Textarea
                  rows={6}
                  className="font-mono text-xs"
                  placeholder="[2026-10-26T14:24:04Z] ERROR: Unhandled rejection..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Contexto Adicional (Origem / Serviço)
                </label>
                <Input
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Ex: Pod billing-worker-7c9f no cluster prod-sa-east-1"
                />
              </div>
            </>
          )}

          {type === "MANUAL_NOTE" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Observação Técnica <span className="text-rose-400">*</span>
              </label>
              <Textarea
                rows={5}
                placeholder="Descreva hipóteses preliminares, comportamento de rede observado ou correlações manuais..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          )}

          {type === "IMAGE" && (
            <div className="space-y-3.5">
              {/* Disclaimer preventivo de segurança (SPEC-08 RF-07) */}
              <div
                data-testid="image-secret-disclaimer"
                className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/95"
              >
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-semibold text-amber-300">
                    Atenção com credenciais em capturas de tela:
                  </span>{" "}
                  verifique o print antes do envio e oculte chaves de API, senhas, cookies ou tokens Bearer visíveis na imagem. A captura será armazenada no Cloud Storage e enviada à IA na geração do diagnóstico.
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                data-testid="image-file-input"
                disabled={isImageLimitReached || isSubmitting}
                onChange={(e) => handleSelectFile(e.target.files?.[0])}
              />

              {!selectedFile ? (
                <div
                  role="button"
                  tabIndex={isImageLimitReached ? -1 : 0}
                  data-testid="image-dropzone"
                  onClick={() => {
                    if (!isImageLimitReached && !isSubmitting) {
                      fileInputRef.current?.click();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      (e.key === "Enter" || e.key === " ") &&
                      !isImageLimitReached &&
                      !isSubmitting
                    ) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isImageLimitReached) setIsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isImageLimitReached) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={handleDrop}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-7 text-center transition-colors",
                    isImageLimitReached
                      ? "border-zinc-800 bg-zinc-950/40 opacity-60 cursor-not-allowed"
                      : isDragging
                        ? "border-teal-400 bg-teal-500/10 cursor-copy"
                        : "border-zinc-700/80 bg-zinc-950/60 hover:border-zinc-500 hover:bg-zinc-900/50 cursor-pointer",
                  )}
                >
                  <div className="rounded-full border border-zinc-800 bg-zinc-900 p-2.5">
                    <UploadCloud className="h-5 w-5 text-teal-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-zinc-200">
                      {isImageLimitReached
                        ? `Limite de ${MAX_IMAGES_PER_OCCURRENCE} fotos atingido nesta ocorrência`
                        : "Arraste e solte uma captura de tela aqui ou clique para selecionar"}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      PNG, JPEG ou WEBP • Máximo 5MB por foto ({existingImageCount}/
                      {MAX_IMAGES_PER_OCCURRENCE} utilizadas)
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  data-testid="image-local-preview"
                  className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ImagePlus className="h-4 w-4 text-teal-400 shrink-0" />
                      <span className="font-mono text-xs text-zinc-200 truncate">
                        {selectedFile.name}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                        ({formatFileSize(selectedFile.size)})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={handleRemoveSelectedFile}
                      className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  </div>

                  {previewUrl && (
                    <div className="relative overflow-hidden rounded border border-zinc-800/90 bg-zinc-900/60 flex items-center justify-center max-h-56">
                      <img
                        src={previewUrl}
                        alt={`Pré-visualização de ${selectedFile.name}`}
                        className="max-h-56 w-auto object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-300">
                    Contexto / Observações da Imagem (opcional)
                  </label>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {notes.length}/2000
                  </span>
                </div>
                <Textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="Ex: Print da resposta 502 Bad Gateway exibida na aba Network do DevTools..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || (type === "IMAGE" && isImageLimitReached)
              }
            >
              {isSubmitting
                ? type === "IMAGE"
                  ? "Enviando imagem..."
                  : "Salvando..."
                : "Salvar Evidência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
