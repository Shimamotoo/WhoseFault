import React, { useState } from "react";
import { HTTP_METHODS, type HttpMethod } from "@/types/domain";
import { useOccurrences } from "@/context/OccurrencesContext";
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
import { AlertCircle } from "lucide-react";

interface CreateOccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export const CreateOccurrenceDialog: React.FC<CreateOccurrenceDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => {
  const { createOccurrence } = useOccurrences();
  const [apiName, setApiName] = useState("");
  const [method, setMethod] = useState<HttpMethod>("POST");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!apiName.trim()) {
      setError("Nome ou identificador da API é obrigatório.");
      return;
    }

    if (!url.trim()) {
      setError("URL pretendida é obrigatória.");
      return;
    }

    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("A URL deve utilizar o protocolo HTTP ou HTTPS.");
        return;
      }
    } catch {
      setError(
        "A URL informada deve ser absoluta e válida, ex: https://api.exemplo.com/v1/recurso.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createOccurrence({
        apiName,
        method,
        url,
        description: description.trim() || undefined,
      });

      setApiName("");
      setMethod("POST");
      setUrl("");
      setDescription("");
      onOpenChange(false);
      onCreated?.(created.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a ocorrência na API.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Registrar Nova Ocorrência</DialogTitle>
          <DialogDescription>
            Registre uma falha ou comportamento inesperado de integração com API. A descrição e as evidências técnicas são opcionais no momento do registro.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="occ-api-name"
              className="text-xs font-medium text-zinc-300"
            >
              Nome ou Identificador da API <span className="text-rose-400">*</span>
            </label>
            <Input
              id="occ-api-name"
              placeholder="Ex: Stripe Billing API v1, GitHub REST API..."
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="occ-method"
                className="text-xs font-medium text-zinc-300"
              >
                Método HTTP <span className="text-rose-400">*</span>
              </label>
              <select
                id="occ-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                className="flex h-8 w-full rounded-md border border-input bg-zinc-950 px-2.5 py-1 font-mono text-xs font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m} className="bg-zinc-950 font-mono">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="occ-url"
                className="text-xs font-medium text-zinc-300"
              >
                URL Pretendida <span className="text-rose-400">*</span>
              </label>
              <Input
                id="occ-url"
                className="font-mono"
                placeholder="https://api.exemplo.com/v1/webhooks"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="occ-description"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span>Descrição Original do Problema</span>
              <span className="text-[11px] font-normal text-zinc-500">
                Opcional — usada pela IA para gerar o título curto
              </span>
            </label>
            <Textarea
              id="occ-description"
              rows={4}
              placeholder="Descreva o comportamento observado, contexto da chamada ou erro retornado (sem incluir tokens ou chaves reais)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Criando..." : "Criar Ocorrência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
