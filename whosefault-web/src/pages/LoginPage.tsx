import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal } from "lucide-react";

export const LoginPage: React.FC = () => {
  const {
    user,
    loading,
    actionLoading,
    error,
    signInWithGoogle,
    signInAsGuest,
  } = useAuth();

  // Enquanto verifica sessão persistida no navegador
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center animate-pulse">
            <Terminal className="h-4 w-4 stroke-[2.2]" />
          </div>
          <span className="font-mono text-xs text-zinc-400">
            Verificando sessão...
          </span>
        </div>
      </div>
    );
  }

  // Se já estiver autenticado, avança direto para a tela de ocorrências
  if (user) {
    return <Navigate to="/occurrences" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-zinc-800 relative overflow-hidden">
      {/* Background sutil */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/30 via-zinc-950 to-zinc-950" />

      {/* Top Bar */}
      <header className="relative z-10 h-16 px-6 sm:px-10 flex items-center justify-between border-b border-zinc-900/80">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center shadow-sm">
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
        </div>
        <Badge
          variant="outline"
          className="font-mono text-[10px] border-zinc-800 bg-zinc-900/80 text-zinc-400 px-2 py-0.5"
        >
          v1.1
        </Badge>
      </header>

      {/* Card Central de Login */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px] rounded-xl border border-zinc-800/90 bg-zinc-950/90 p-7 shadow-2xl backdrop-blur-sm space-y-6">
          <div className="space-y-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
              Entrar no WhoseFault
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Centralize ocorrências, evidências técnicas e diagnósticos de
              integrações de APIs assistidos por IA.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md bg-red-950/50 border border-red-800/60 p-3 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          <div className="space-y-3">
            {/* Botão Google */}
            <Button
              type="button"
              variant="outline"
              data-testid="btn-login-google"
              className="w-full h-11 border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 font-medium transition-all"
              onClick={() => void signInWithGoogle()}
              disabled={actionLoading}
            >
              <svg className="w-4 h-4 mr-2.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              {actionLoading ? "Conectando..." : "Entrar com conta Google"}
            </Button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-zinc-950 px-2.5 text-zinc-500 font-mono">
                  ou acesso imediato
                </span>
              </div>
            </div>

            {/* Botão Visitante */}
            <Button
              type="button"
              variant="secondary"
              data-testid="btn-login-guest"
              className="w-full h-10 bg-zinc-900 hover:bg-zinc-800/90 text-zinc-300 hover:text-zinc-100 border border-zinc-800 text-xs font-medium"
              onClick={() => void signInAsGuest()}
              disabled={actionLoading}
            >
              {actionLoading
                ? "Iniciando sessão..."
                : "Entrar como Visitante (Sem Cadastro)"}
            </Button>
          </div>

          <div className="pt-2 border-t border-zinc-900 text-center">
            <p className="text-[11px] text-zinc-500 leading-normal">
              No Modo Visitante, suas ocorrências ficam salvas temporariamente e
              expiram após 30 dias de inatividade.
            </p>
          </div>
        </div>
      </main>

      {/* Espaçador inferior sutil */}
      <footer className="relative z-10 h-10" />
    </div>
  );
};
