import React from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LoginDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  canClose?: boolean;
}

export const LoginDialog: React.FC<LoginDialogProps> = ({
  open,
  onOpenChange,
  canClose = false,
}) => {
  const { user, signInWithGoogle, signInAsGuest, actionLoading, error, clearError } =
    useAuth();

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !canClose && !user) {
      return; // Previne fechar se o usuário ainda não está autenticado
    }
    clearError();
    onOpenChange?.(newOpen);
  };

  const isAnonymous = user?.isAnonymous ?? false;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[420px] bg-zinc-950 border-zinc-800 text-zinc-100"
        onEscapeKeyDown={(e) => {
          if (!canClose && !user) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!canClose && !user) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-3 text-center sm:text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-100">
            {isAnonymous ? "Salvar sua Conta" : "Entrar no WhoseFault"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            {isAnonymous
              ? "Vincule sua conta Google para manter suas ocorrências salvas permanentemente sem limite de expiração."
              : "Conecte-se para investigar falhas de integrações de APIs e gerar diagnósticos assistidos por inteligência artificial."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-950/50 border border-red-800/60 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2">
          {/* Botão Entrar com Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full relative h-11 border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-100 font-medium transition-all"
            onClick={signInWithGoogle}
            disabled={actionLoading}
          >
            <svg className="w-4 h-4 mr-2.5" viewBox="0 0 24 24">
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
            {actionLoading ? "Conectando..." : isAnonymous ? "Vincular com o Google" : "Continuar com o Google"}
          </Button>

          {!isAnonymous && (
            <>
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-950 px-2 text-zinc-500">ou</span>
                </div>
              </div>

              {/* Botão Modo Visitante */}
              <Button
                type="button"
                variant="ghost"
                className="w-full h-10 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 text-xs"
                onClick={signInAsGuest}
                disabled={actionLoading}
              >
                {actionLoading ? "Iniciando sessão..." : "Acessar de forma rápida como Visitante"}
              </Button>
            </>
          )}
        </div>

        <p className="text-[11px] text-center text-zinc-500 pt-2">
          {isAnonymous
            ? "Ao vincular sua conta Google, todas as investigações criadas nesta sessão serão salvas."
            : "No modo visitante, seus dados expiram automaticamente após 30 dias de inatividade."}
        </p>
      </DialogContent>
    </Dialog>
  );
};
