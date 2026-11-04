import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOccurrences } from "@/context/OccurrencesContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpMethodBadge } from "@/components/domain/HttpMethodBadge";
import { CreateOccurrenceDialog } from "@/components/domain/CreateOccurrenceDialog";
import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  FolderOpen,
  Plus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const OccurrencesListPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    occurrences,
    pollingTitleIds,
    isLoading,
    error,
    refreshOccurrences,
  } = useOccurrences();
  const [createOpen, setCreateOpen] = useState(false);

  const sortedOccurrences = useMemo(() => {
    return [...occurrences].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [occurrences]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Listagem */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
              Ocorrências de Integração
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Consulte falhas e comportamentos inesperados de APIs ordenados por data de criação.
          </p>
        </div>

        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="btn-new-occurrence"
          className="shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Ocorrência
        </Button>
      </div>

      {/* Estado de Erro de Conexão */}
      {error && !isLoading && (
        <div
          data-testid="occurrences-error-state"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-rose-300">
                Falha de comunicação com a API
              </div>
              <p className="text-rose-200/90">{error}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshOccurrences()}
            className="shrink-0 border-rose-500/40 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Estado de Carregamento (Skeleton) */}
      {isLoading ? (
        <div className="space-y-3" data-testid="occurrences-skeleton">
          {[1, 2, 3].map((item) => (
            <Card
              key={item}
              className="border-zinc-800/80 bg-zinc-900/30 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <div className="flex items-center gap-3 pt-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </Card>
          ))}
        </div>
      ) : sortedOccurrences.length === 0 ? (
        /* Empty State */
        <div
          data-testid="occurrences-empty-state"
          className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-16 text-center max-w-xl mx-auto my-6 space-y-4"
        >
          <div className="mx-auto h-10 w-10 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-zinc-100">
              Nenhuma ocorrência cadastrada
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
              Você ainda não registrou incidentes de API neste workspace. Inicie uma investigação informando a API, método HTTP e a URL pretendida (mesmo sem resposta HTTP ou evidências completas).
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="btn-empty-create-occurrence"
            >
              <Plus className="h-3.5 w-3.5" />
              Registrar primeira ocorrência
            </Button>
          </div>
        </div>
      ) : (
        /* Lista de Cards de Ocorrências */
        <div className="space-y-3" data-testid="occurrences-list">
          {sortedOccurrences.map((occ) => {
            const isGenericTitle = occ.title === "Ocorrência sem descrição";
            const isPollingTitle = Boolean(pollingTitleIds[occ.id]) && isGenericTitle;

            return (
              <Card
                key={occ.id}
                data-testid={`occurrence-card-${occ.id}`}
                onClick={() => navigate(`/occurrences/${occ.id}`)}
                className="group cursor-pointer border-zinc-800/90 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700/90 transition-all duration-150"
              >
                <CardContent className="p-4 sm:p-5 space-y-3">
                  {/* Linha 1: API Name + Metadados de Evidências/Diagnóstico + Data de Criação */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="bg-zinc-950/80 border-zinc-800 text-zinc-300 font-medium text-[11px]"
                      >
                        {occ.apiName}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span
                        className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500 pl-1"
                        title={`Criada em ${occ.createdAt}`}
                      >
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(occ.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Linha 2: Título da Ocorrência */}
                  <div className="flex items-start justify-between gap-4">
                    {isPollingTitle ? (
                      <div
                        data-testid={`occurrence-title-polling-${occ.id}`}
                        className="py-0.5"
                      >
                        <Skeleton className="h-4 w-52 sm:w-64 rounded" />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <h2
                          className={cn(
                            "text-sm font-semibold leading-snug group-hover:text-white transition-colors",
                            isGenericTitle
                              ? "text-zinc-400 italic"
                              : "text-zinc-100",
                          )}
                        >
                          {occ.title}
                        </h2>
                      </div>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0 mt-0.5" />
                  </div>

                  {/* Linha 3: Método HTTP colorido + URL truncada em fonte monoespaçada */}
                  <div className="flex items-center gap-2.5 rounded-md border border-zinc-800/80 bg-zinc-950/90 px-3 py-2">
                    <HttpMethodBadge method={occ.method} size="sm" />
                    <span
                      className="font-mono text-xs text-zinc-300 truncate select-all"
                      title={occ.url}
                    >
                      {occ.url}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateOccurrenceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/occurrences/${id}`)}
      />
    </div>
  );
};
