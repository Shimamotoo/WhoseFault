import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useOccurrences } from "@/context/OccurrencesContext";
import {
  Activity,
  ChevronRight,
  Database,
  Layers,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { occurrences, apiStatus, isLoading, refreshOccurrences } =
    useOccurrences();

  // Identifica se estamos em /occurrences/:id para construir o Breadcrumb dinâmico
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const isOccurrencesRoot =
    pathSegments.length === 1 && pathSegments[0] === "occurrences";
  const occurrenceId =
    pathSegments.length === 2 && pathSegments[0] === "occurrences"
      ? pathSegments[1]
      : null;

  const activeOccurrence = occurrenceId
    ? occurrences.find((o) => o.id === occurrenceId)
    : undefined;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row selection:bg-zinc-800">
      {/* Sidebar Minimalista estilo DevTools (Vercel / Sentry) */}
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950/95 flex flex-col justify-between">
        <div>
          {/* Brand Header */}
          <div className="h-14 px-4 border-b border-zinc-800/80 flex items-center justify-between">
            <Link
              to="/occurrences"
              className="flex items-center gap-2.5 group focus:outline-none"
            >
              <div className="h-7 w-7 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center shadow-sm group-hover:bg-white transition-colors">
                <Terminal className="h-4 w-4 stroke-[2.2]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold tracking-tight text-zinc-100 leading-none">
                  WhoseFault
                </span>
                <span className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  api-inspector
                </span>
              </div>
            </Link>
            <Badge
              variant="outline"
              className="font-mono text-[10px] border-zinc-800 bg-zinc-900/80 text-zinc-400 px-1.5 py-0"
            >
              v1.0
            </Badge>
          </div>

          {/* Primary Navigation */}
          <div className="p-3 space-y-4">
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Investigação
              </div>
              <nav className="space-y-1">
                <Link
                  to="/occurrences"
                  className={cn(
                    "flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
                    location.pathname.startsWith("/occurrences")
                      ? "bg-zinc-900 text-zinc-100 border border-zinc-800/90 shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-zinc-400" />
                    Ocorrências
                  </span>
                  <span className="font-mono text-[11px] rounded bg-zinc-800/90 px-1.5 py-0.5 text-zinc-300">
                    {occurrences.length}
                  </span>
                </Link>
              </nav>
            </div>

            {/* Painel de Conectividade e Sincronização */}
            <div className="pt-2 border-t border-zinc-900">
              <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                <span>Conectividade</span>
                <Activity
                  className={cn(
                    "h-3 w-3",
                    apiStatus === "online"
                      ? "text-emerald-400"
                      : apiStatus === "offline"
                        ? "text-rose-400"
                        : "text-amber-400",
                  )}
                />
              </div>
              <div className="space-y-1.5 px-1">
                <div
                  data-testid="api-status-indicator"
                  className={cn(
                    "w-full flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11px]",
                    apiStatus === "online"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : apiStatus === "offline"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : "border-zinc-800/80 bg-zinc-900/40 text-zinc-400",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        apiStatus === "online"
                          ? "bg-emerald-400"
                          : apiStatus === "offline"
                            ? "bg-rose-400"
                            : "bg-amber-400 animate-pulse",
                      )}
                    />
                    {apiStatus === "online"
                      ? "API Online"
                      : apiStatus === "offline"
                        ? "API Offline"
                        : "Verificando API..."}
                  </span>
                  <span className="font-mono text-[10px] opacity-80">
                    :3333
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void refreshOccurrences()}
                  disabled={isLoading}
                  data-testid="btn-sync-data"
                  className="w-full flex items-center gap-1.5 rounded-md border border-zinc-800/60 bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw
                    className={cn("h-3 w-3", isLoading && "animate-spin")}
                  />
                  <span>Sincronizar Dados</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer de Segurança & Ambiente */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Secret Guard Ativo</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
            <Database className="h-3 w-3 text-zinc-500 shrink-0" />
            <span className="truncate">database: postgresql</span>
          </div>
        </div>
      </aside>

      {/* Área Principal com Header (Breadcrumbs) e Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm px-6 flex items-center justify-between sticky top-0 z-20">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs min-w-0"
          >
            <span className="text-zinc-500 font-mono text-[11px]">
              workspace
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
            <Link
              to="/occurrences"
              className={cn(
                "transition-colors truncate",
                isOccurrencesRoot
                  ? "font-medium text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              Ocorrências
            </Link>

            {occurrenceId && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                <span className="font-mono text-[11px] text-zinc-200 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded truncate max-w-[260px] sm:max-w-[420px]">
                  {activeOccurrence
                    ? `${activeOccurrence.apiName} (${activeOccurrence.id})`
                    : occurrenceId}
                </span>
              </>
            )}
          </nav>

          <div className="hidden sm:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/70 px-2.5 py-0.5 font-mono text-[10px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              dark:new-york
            </span>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
