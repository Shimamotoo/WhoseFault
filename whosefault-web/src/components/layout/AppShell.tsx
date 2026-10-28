import React, { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useOccurrences } from "@/context/OccurrencesContext";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronRight,
  Layers,
  LogOut,
  Terminal,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/auth/LoginDialog";

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { occurrences } = useOccurrences();
  const { user, loading: authLoading, signOut } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center animate-pulse">
            <Terminal className="h-4 w-4 stroke-[2.2]" />
          </div>
          <span className="font-mono text-xs text-zinc-400">
            Carregando ambiente...
          </span>
        </div>
      </div>
    );
  }

  // Redireciona para /login caso não haja usuário autenticado
  if (!user) {
    return <Navigate to="/login" replace />;
  }

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

  const isAnonymous = user.isAnonymous;
  const showPhoto = Boolean(user.photoURL) && !avatarError;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row selection:bg-zinc-800">
      {/* Diálogo para Vincular Conta Google quando em Modo Visitante */}
      <LoginDialog
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        canClose={true}
      />

      {/* Sidebar Clean */}
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950 flex flex-col justify-between">
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
              v1.1
            </Badge>
          </div>

          {/* Primary Navigation */}
          <div className="p-3">
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
        </div>

        {/* Card do Perfil do Usuário */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {showPhoto ? (
                  <img
                    src={user.photoURL!}
                    alt={user.displayName || "Foto de perfil"}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="h-8 w-8 rounded-full object-cover border border-zinc-700/80 shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0">
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex flex-col">
                  <span className="truncate text-xs font-medium text-zinc-100 leading-tight">
                    {user.displayName || (isAnonymous ? "Visitante" : "Usuário")}
                  </span>
                  {user.email ? (
                    <span className="truncate text-[11px] text-zinc-400 leading-tight mt-0.5">
                      {user.email}
                    </span>
                  ) : (
                    <span className="truncate text-[10px] font-mono text-amber-400/90 leading-tight mt-0.5">
                      Sessão temporária
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                title="Sair da conta"
                className="text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 rounded-md transition-colors p-1.5 shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>

            {isAnonymous && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                onClick={() => setLoginModalOpen(true)}
              >
                Salvar conta com Google
              </Button>
            )}
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
                    ? `${activeOccurrence.apiName} (${activeOccurrence.id.slice(0, 8)})`
                    : occurrenceId}
                </span>
              </>
            )}
          </nav>

          {isAnonymous && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] px-2 py-0.5"
              >
                Modo Visitante (30 dias)
              </Badge>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
