import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useOccurrences } from "@/context/OccurrencesContext";
import { HTTP_METHODS, type Evidence, type HttpMethod } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EvidenceTypeBadge,
  HttpMethodBadge,
  HttpStatusBadge,
} from "@/components/domain/HttpMethodBadge";
import { CreateEvidenceDialog } from "@/components/domain/CreateEvidenceDialog";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Edit3,
  FileCode2,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getEvidenceSummary(ev: Evidence): string {
  if (ev.type === "HTTP_REQUEST") {
    return `${ev.method ?? "REQ"} ${ev.url ?? ""}`;
  }
  if (ev.type === "HTTP_RESPONSE") {
    return `Status HTTP ${ev.statusCode ?? "---"}${ev.notes ? ` — ${ev.notes}` : ""}`;
  }
  if (ev.type === "ERROR_LOG") {
    const firstLine = ev.content?.split("\n")[0] ?? "Log de erro";
    return firstLine.length > 90 ? `${firstLine.slice(0, 90)}...` : firstLine;
  }
  const text = ev.content ?? "Observação manual";
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

export const OccurrenceDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    occurrences,
    evidencesByOccurrence,
    diagnosesByOccurrence,
    loadOccurrenceDetails,
    updateOccurrence,
    retryTitleGeneration,
    deleteEvidence,
    requestDiagnosis,
  } = useOccurrences();

  const occurrence = occurrences.find((o) => o.id === id);
  const evidences = id ? (evidencesByOccurrence[id] ?? []) : [];
  const diagnosis = id ? diagnosesByOccurrence[id] : undefined;

  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  // Modais de gerenciamento (Edição de Ocorrência, Nova Evidência, Confirmação de Exclusão)
  const [editOpen, setEditOpen] = useState(false);
  const [createEvidenceOpen, setCreateEvidenceOpen] = useState(false);
  const [evidenceToDelete, setEvidenceToDelete] = useState<Evidence | null>(
    null,
  );
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingEvidence, setIsDeletingEvidence] = useState(false);

  // Estado do formulário de edição da ocorrência
  const [editApiName, setEditApiName] = useState("");
  const [editMethod, setEditMethod] = useState<HttpMethod>("GET");
  const [editUrl, setEditUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setIsLoadingDetails(true);
    setDetailsError(null);

    loadOccurrenceDetails(id)
      .catch((err) => {
        if (!active) return;
        setDetailsError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os detalhes da ocorrência.",
        );
      })
      .finally(() => {
        if (active) {
          setIsLoadingDetails(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id, loadOccurrenceDetails]);

  if (isLoadingDetails && !occurrence) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-10 text-center space-y-3">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400 mx-auto" />
        <p className="text-xs text-zinc-400">
          Carregando detalhes da ocorrência...
        </p>
      </div>
    );
  }

  if (!occurrence) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-10 text-center space-y-4">
        <h2 className="text-sm font-semibold text-zinc-100">
          Ocorrência não encontrada
        </h2>
        <p className="text-xs text-zinc-400">
          {detailsError ??
            `O registro solicitado (${id}) não existe na base de dados.`}
        </p>
        <Button asChild variant="outline">
          <Link to="/occurrences">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Ocorrências
          </Link>
        </Button>
      </div>
    );
  }

  const handleRequestDiagnosis = async () => {
    if (isGeneratingDiagnosis) return;
    setIsGeneratingDiagnosis(true);
    setDiagnosisError(null);
    try {
      await requestDiagnosis(occurrence.id);
    } catch (err) {
      setDiagnosisError(
        err instanceof Error
          ? err.message
          : "Falha ao solicitar diagnóstico assistido por IA.",
      );
    } finally {
      setIsGeneratingDiagnosis(false);
    }
  };

  const handleRetryTitle = async () => {
    try {
      await retryTitleGeneration(occurrence.id);
    } catch (err) {
      setDetailsError(
        err instanceof Error ? err.message : "Falha ao tentar gerar título.",
      );
    }
  };

  const openEditDialog = () => {
    setEditApiName(occurrence.apiName);
    setEditMethod(occurrence.method);
    setEditUrl(occurrence.url);
    setEditDescription(occurrence.description ?? "");
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveOccurrenceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editApiName.trim()) {
      setEditError("Nome da API é obrigatório.");
      return;
    }
    try {
      const parsed = new URL(editUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setEditError("A URL deve utilizar protocolo HTTP ou HTTPS.");
        return;
      }
    } catch {
      setEditError("A URL informada é inválida.");
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateOccurrence(occurrence.id, {
        apiName: editApiName,
        method: editMethod,
        url: editUrl,
        description: editDescription,
      });
      setEditOpen(false);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Falha ao salvar alterações.",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDeleteEvidence = async () => {
    if (!evidenceToDelete || isDeletingEvidence) return;
    setIsDeletingEvidence(true);
    try {
      await deleteEvidence(occurrence.id, evidenceToDelete.id);
      setEvidenceToDelete(null);
    } catch (err) {
      setDetailsError(
        err instanceof Error ? err.message : "Falha ao excluir evidência.",
      );
    } finally {
      setIsDeletingEvidence(false);
    }
  };

  const canRetryTitle =
    occurrence.title === "Ocorrência sem descrição" &&
    Boolean(occurrence.description && occurrence.description.trim() !== "");

  return (
    <div className="space-y-6">
      {/* Banner de Bloqueio Operacional durante Geração de Diagnóstico */}
      {isGeneratingDiagnosis && (
        <div
          data-testid="diagnosis-loading-banner"
          className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-xs text-blue-200 animate-pulse"
        >
          <div className="flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
            <span>
              <strong>Processando Diagnóstico por IA:</strong> Analisando ocorrência e evidências disponíveis...
            </span>
          </div>
          <span className="font-mono text-[11px] text-blue-300 shrink-0">
            processando
          </span>
        </div>
      )}

      {(detailsError || diagnosisError) && (
        <div
          data-testid="details-error-alert"
          className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200"
        >
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{diagnosisError ?? detailsError}</span>
        </div>
      )}

      {/* Container que aplica disabled visual/funcional na tela durante a análise da IA */}
      <div
        aria-busy={isGeneratingDiagnosis}
        className={cn(
          "space-y-6 transition-opacity duration-200",
          isGeneratingDiagnosis && "pointer-events-none opacity-65 select-none",
        )}
      >
        {/* TOPO: Cabeçalho da Ocorrência (Título, Método, URL e Ações) */}
        <div className="rounded-lg border border-zinc-800/90 bg-zinc-900/40 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-zinc-400 hover:text-zinc-100"
              >
                <Link to="/occurrences">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </Link>
              </Button>
              <span className="text-zinc-700">|</span>
              <Badge
                variant="outline"
                className="bg-zinc-950 border-zinc-800 text-zinc-200 font-medium"
              >
                {occurrence.apiName}
              </Badge>
              <span className="font-mono text-[11px] text-zinc-500">
                ID: {occurrence.id}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canRetryTitle && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isGeneratingDiagnosis}
                  onClick={() => void handleRetryTitle()}
                  title="Tentar gerar título curto a partir da descrição"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Gerar Título IA
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGeneratingDiagnosis}
                onClick={openEditDialog}
                data-testid="btn-edit-occurrence"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Editar Ocorrência
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={isGeneratingDiagnosis}
                onClick={() => void handleRequestDiagnosis()}
                data-testid="btn-request-diagnosis"
                className="bg-zinc-100 text-zinc-950 hover:bg-white font-semibold"
              >
                {isGeneratingDiagnosis ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Solicitando Diagnóstico...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Solicitar Diagnóstico IA
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Título Principal da Ocorrência */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Título Atual da Ocorrência
            </div>
            <h1
              data-testid="occurrence-detail-title"
              className={cn(
                "text-base sm:text-lg font-semibold tracking-tight",
                occurrence.title === "Ocorrência sem descrição"
                  ? "text-zinc-400 italic"
                  : "text-zinc-50",
              )}
            >
              {occurrence.title}
            </h1>
          </div>

          {/* Barra Monoespaçada com Método HTTP e URL Completa */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <HttpMethodBadge method={occurrence.method} />
            <code
              data-testid="occurrence-detail-url"
              className="font-mono text-xs text-zinc-200 break-all select-all"
            >
              {occurrence.url}
            </code>
          </div>

          {/* Metadados de Tempo */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-zinc-500 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              criada: {formatDateTime(occurrence.createdAt)}
            </span>
            <span>•</span>
            <span>atualizada: {formatDateTime(occurrence.updatedAt)}</span>
          </div>
        </div>

        {/* CORPO: Sistema de Abas (Aba 1: Geral | Aba 2: Evidências) */}
        <Tabs defaultValue="geral" className="w-full">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <TabsList>
              <TabsTrigger
                value="geral"
                disabled={isGeneratingDiagnosis}
                data-testid="tab-trigger-geral"
                className="gap-2"
              >
                <Layers className="h-3.5 w-3.5" />
                Geral
              </TabsTrigger>
              <TabsTrigger
                value="evidencias"
                disabled={isGeneratingDiagnosis}
                data-testid="tab-trigger-evidencias"
                className="gap-2"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                Evidências
                <span className="ml-1 rounded bg-zinc-700/80 px-1.5 py-0.2 font-mono text-[10px] text-zinc-200">
                  {evidences.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isGeneratingDiagnosis}
              onClick={() => setCreateEvidenceOpen(true)}
              data-testid="btn-add-evidence-header"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar Evidência
            </Button>
          </div>

          {/* ABA 1: GERAL (Descrição Original do Problema + Visão de Diagnóstico) */}
          <TabsContent value="geral" className="space-y-6">
            <Card className="border-zinc-800/90 bg-zinc-900/30">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-sm text-zinc-100">
                    Descrição Original do Problema
                  </CardTitle>
                  <CardDescription>
                    Preservada separadamente do título gerado pela IA.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isGeneratingDiagnosis}
                  onClick={openEditDialog}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  {occurrence.description ? "Editar" : "Adicionar descrição"}
                </Button>
              </CardHeader>
              <CardContent>
                {occurrence.description ? (
                  <div
                    data-testid="occurrence-description-content"
                    className="rounded-md border border-zinc-800/80 bg-zinc-950/80 p-4 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap"
                  >
                    {occurrence.description}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center space-y-2">
                    <p className="text-xs text-zinc-400">
                      Esta ocorrência foi registrada sem descrição textual.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isGeneratingDiagnosis}
                      onClick={openEditDialog}
                    >
                      Adicionar descrição agora
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Painel de Diagnóstico Assistido por IA */}
            <Card className="border-zinc-800/90 bg-zinc-900/30">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-zinc-300" />
                    <CardTitle className="text-sm text-zinc-100">
                      Diagnóstico Assistido por IA
                    </CardTitle>
                  </div>

                  {diagnosis && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        diagnosis.isOutdated
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                      )}
                    >
                      {diagnosis.isOutdated
                        ? "STATUS: DESATUALIZADO"
                        : "STATUS: ATUALIZADO"}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Análise estruturada de fatos observados, hipóteses de causa e informações faltantes.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {!diagnosis ? (
                  <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center space-y-3">
                    <p className="text-xs text-zinc-400">
                      Nenhum diagnóstico foi gerado para esta ocorrência até o momento.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isGeneratingDiagnosis}
                      onClick={() => void handleRequestDiagnosis()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Solicitar Diagnóstico IA
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Alerta de Diagnóstico Desatualizado */}
                    {diagnosis.isOutdated && (
                      <div
                        data-testid="diagnosis-outdated-alert"
                        className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200"
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-semibold text-amber-300">
                            Diagnóstico Desatualizado
                          </div>
                          <p className="text-amber-200/90 leading-relaxed">
                            Os dados da ocorrência ou suas evidências foram alterados após a geração desta análise ({formatDateTime(diagnosis.createdAt)}). Solicite um novo diagnóstico para considerar o estado atual da investigação.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Fatos Observados */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Fatos Observados</span>
                      </div>
                      <ul className="space-y-1.5 rounded-md border border-zinc-800/80 bg-zinc-950/70 p-3.5 text-xs text-zinc-300 list-disc list-inside">
                        {diagnosis.result.facts_observed.map((fact, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {fact}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Hipóteses Levantadas */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                        <span>Hipóteses Fundamentadas</span>
                      </div>
                      <div className="space-y-2.5">
                        {diagnosis.result.hypotheses.map((hyp, idx) => (
                          <div
                            key={idx}
                            className="rounded-md border border-zinc-800/90 bg-zinc-950/80 p-3.5 space-y-1.5"
                          >
                            <div className="text-xs font-medium text-zinc-100">
                              #{idx + 1} — {hyp.cause}
                            </div>
                            <div className="text-[11px] font-mono text-zinc-400">
                              Evidência de suporte: {hyp.evidence_support}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Informações Faltantes */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                        <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                        <span>Informações Adicionais Necessárias</span>
                      </div>
                      <ul className="space-y-1.5 rounded-md border border-zinc-800/80 bg-zinc-950/70 p-3.5 text-xs text-zinc-300 list-disc list-inside">
                        {diagnosis.result.missing_information.map(
                          (info, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {info}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 2: EVIDÊNCIAS (Accordions expansíveis + Tipografia Monoespaçada Obrigatória) */}
          <TabsContent value="evidencias" className="space-y-4">
            {evidences.length === 0 ? (
              <div
                data-testid="evidences-empty-state"
                className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/20 p-12 text-center space-y-3"
              >
                <FileCode2 className="h-7 w-7 text-zinc-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Nenhuma evidência técnica registrada
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Esta ocorrência ainda não possui requisições HTTP, respostas, logs de erro ou observações manuais anexadas.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCreateEvidenceOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Registrar primeira evidência
                </Button>
              </div>
            ) : (
              <Card className="border-zinc-800/90 bg-zinc-900/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-100">
                    Linha do Tempo de Evidências ({evidences.length})
                  </CardTitle>
                  <CardDescription>
                    Clique em uma evidência para expandir cabeçalhos, payloads JSON e stack traces em fonte monoespaçada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <Accordion
                    type="multiple"
                    defaultValue={evidences.map((e) => e.id)}
                    className="w-full"
                  >
                    {evidences.map((ev, index) => (
                      <AccordionItem
                        key={ev.id}
                        value={ev.id}
                        data-testid={`evidence-item-${ev.id}`}
                      >
                        <AccordionTrigger className="hover:no-underline px-2 rounded hover:bg-zinc-900/70">
                          <div className="flex flex-wrap items-center gap-2.5 pr-4 min-w-0 text-left">
                            <span className="font-mono text-[11px] text-zinc-500">
                              #{index + 1}
                            </span>
                            <EvidenceTypeBadge type={ev.type} />
                            {ev.type === "HTTP_REQUEST" && ev.method && (
                              <HttpMethodBadge method={ev.method} size="sm" />
                            )}
                            {ev.type === "HTTP_RESPONSE" &&
                              ev.statusCode !== undefined && (
                                <HttpStatusBadge statusCode={ev.statusCode} />
                              )}
                            <span className="font-mono text-xs text-zinc-200 truncate max-w-[260px] sm:max-w-[480px]">
                              {getEvidenceSummary(ev)}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500 ml-auto">
                              {formatDateTime(ev.createdAt)}
                            </span>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-2 pt-2 space-y-3">
                          <div className="rounded-md border border-zinc-800 bg-zinc-950/90 p-4 space-y-4">
                            {/* Metadados e Botão de Exclusão com Confirmação */}
                            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                              <span className="font-mono text-[11px] text-zinc-400">
                                evidence_id: {ev.id}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEvidenceToDelete(ev)}
                                data-testid={`btn-delete-evidence-${ev.id}`}
                                className="h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir Evidência
                              </Button>
                            </div>

                            {/* Detalhes de HTTP_REQUEST */}
                            {ev.type === "HTTP_REQUEST" && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-mono uppercase text-zinc-500">
                                    Endpoint da Requisição
                                  </div>
                                  <div className="flex items-center gap-2 rounded border border-zinc-800/90 bg-zinc-900/60 p-2.5">
                                    {ev.method && (
                                      <HttpMethodBadge
                                        method={ev.method}
                                        size="sm"
                                      />
                                    )}
                                    <code className="font-mono text-xs text-zinc-100 break-all">
                                      {ev.url}
                                    </code>
                                  </div>
                                </div>

                                {ev.headers &&
                                  Object.keys(ev.headers).length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-[10px] font-mono uppercase text-zinc-500">
                                        Request Headers
                                      </div>
                                      <pre className="rounded border border-zinc-800/90 bg-zinc-900/50 p-3 font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all overflow-x-auto">
                                        {JSON.stringify(ev.headers, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                {ev.payload && (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                                      Request Payload
                                    </div>
                                    <pre className="rounded border border-zinc-800/90 bg-zinc-900/50 p-3 font-mono text-xs text-emerald-300/95 whitespace-pre-wrap break-all overflow-x-auto max-h-96">
                                      {ev.payload}
                                    </pre>
                                  </div>
                                )}

                                {ev.notes && (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                                      Notas Técnicas
                                    </div>
                                    <p className="text-xs text-zinc-300 bg-zinc-900/40 border border-zinc-800/60 rounded p-2.5">
                                      {ev.notes}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Detalhes de HTTP_RESPONSE */}
                            {ev.type === "HTTP_RESPONSE" && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono uppercase text-zinc-500">
                                    Status Recebido:
                                  </span>
                                  {ev.statusCode !== undefined && (
                                    <HttpStatusBadge
                                      statusCode={ev.statusCode}
                                    />
                                  )}
                                </div>

                                {ev.headers &&
                                  Object.keys(ev.headers).length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-[10px] font-mono uppercase text-zinc-500">
                                        Response Headers
                                      </div>
                                      <pre className="rounded border border-zinc-800/90 bg-zinc-900/50 p-3 font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all overflow-x-auto">
                                        {JSON.stringify(ev.headers, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                {ev.body && (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                                      Response Body
                                    </div>
                                    <pre className="rounded border border-zinc-800/90 bg-zinc-900/50 p-3 font-mono text-xs text-amber-200 whitespace-pre-wrap break-all overflow-x-auto max-h-96">
                                      {ev.body}
                                    </pre>
                                  </div>
                                )}

                                {ev.notes && (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                                      Notas da Resposta
                                    </div>
                                    <p className="text-xs text-zinc-300 bg-zinc-900/40 border border-zinc-800/60 rounded p-2.5">
                                      {ev.notes}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Detalhes de ERROR_LOG */}
                            {ev.type === "ERROR_LOG" && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-mono uppercase text-zinc-500">
                                    Log / Stack Trace Bruto
                                  </div>
                                  <pre className="rounded border border-rose-500/20 bg-zinc-900/70 p-3.5 font-mono text-xs text-rose-200/95 whitespace-pre-wrap break-all overflow-x-auto leading-relaxed">
                                    {ev.content}
                                  </pre>
                                </div>
                                {ev.context && (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                                      Contexto de Execução
                                    </div>
                                    <div className="font-mono text-xs text-zinc-300 bg-zinc-900/40 border border-zinc-800/60 rounded p-2.5">
                                      {ev.context}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Detalhes de MANUAL_NOTE */}
                            {ev.type === "MANUAL_NOTE" && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-mono uppercase text-zinc-500">
                                  Observação Registrada pelo Investigador
                                </div>
                                <div className="rounded border border-zinc-800/80 bg-zinc-900/40 p-3 font-mono text-xs text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                                  {ev.content}
                                </div>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal de Edição da Ocorrência */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar Ocorrência</DialogTitle>
            <DialogDescription>
              A edição preserva os campos não alterados e não modifica automaticamente um título já existente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSaveOccurrenceEdit(e)} className="space-y-4 pt-2">
            {editError && (
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                {editError}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Nome da API
              </label>
              <Input
                value={editApiName}
                onChange={(e) => setEditApiName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Método HTTP
                </label>
                <select
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value as HttpMethod)}
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
                  URL Pretendida
                </label>
                <Input
                  className="font-mono"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Descrição Original do Problema
              </label>
              <Textarea
                rows={4}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSavingEdit}
                onClick={() => setEditOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingEdit}>
                {isSavingEdit ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Adicionar Evidência */}
      <CreateEvidenceDialog
        occurrenceId={occurrence.id}
        defaultMethod={occurrence.method}
        defaultUrl={occurrence.url}
        open={createEvidenceOpen}
        onOpenChange={setCreateEvidenceOpen}
      />

      {/* Modal de Confirmação de Exclusão Definitiva de Evidência */}
      <Dialog
        open={Boolean(evidenceToDelete)}
        onOpenChange={(open) => !open && setEvidenceToDelete(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão Definitiva</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a evidência{" "}
              <code className="font-mono text-zinc-200">
                {evidenceToDelete?.id}
              </code>
              ? Esta ação é definitiva na aplicação e não poderá ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingEvidence}
              onClick={() => setEvidenceToDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingEvidence}
              data-testid="btn-confirm-delete-evidence"
              onClick={() => void handleConfirmDeleteEvidence()}
            >
              {isDeletingEvidence ? "Excluindo..." : "Excluir Definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
