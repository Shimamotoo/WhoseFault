import React, { createContext, useContext, useEffect, useState } from "react";
import {
  type User,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  linkWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "@/services/firebase";
import { syncUserProfile } from "@/services/api";
import type { UserProfile } from "@/types/domain";

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  // Escuta alterações de estado de autenticação do Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const synced = await syncUserProfile();
          setProfile(synced);
        } catch (err) {
          console.warn("Não foi possível sincronizar o perfil no momento:", err);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setActionLoading(true);
    setError(null);
    try {
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        // Se já está logado como visitante, tenta vincular a conta para não perder os dados
        try {
          const result = await linkWithPopup(auth.currentUser, googleProvider);
          setUser(result.user);
          const synced = await syncUserProfile();
          setProfile(synced);
        } catch (linkErr: unknown) {
          const fbErr = linkErr as { code?: string; message?: string };
          if (fbErr.code === "auth/credential-already-in-use") {
            // A conta Google já existe separadamente. Faz o login direto na conta existente.
            const directResult = await signInWithPopup(auth, googleProvider);
            setUser(directResult.user);
            const synced = await syncUserProfile();
            setProfile(synced);
          } else if (
            fbErr.code === "auth/popup-closed-by-user" ||
            fbErr.code === "auth/cancelled-popup-request"
          ) {
            // Usuário fechou o pop-up intencionalmente
            return;
          } else {
            throw linkErr;
          }
        }
      } else {
        // Login direto com o Google
        const result = await signInWithPopup(auth, googleProvider);
        setUser(result.user);
        const synced = await syncUserProfile();
        setProfile(synced);
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (
        fbErr.code === "auth/popup-closed-by-user" ||
        fbErr.code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      setError("Falha ao autenticar com a conta Google. Tente novamente.");
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const signInAsGuest = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await signInAnonymously(auth);
      setUser(result.user);
      const synced = await syncUserProfile();
      setProfile(synced);
    } catch (err) {
      setError("Falha ao iniciar o Modo Visitante. Tente novamente.");
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const signOut = async () => {
    setActionLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error("Erro ao efetuar logout:", err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        actionLoading,
        error,
        clearError,
        signInWithGoogle,
        signInAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um AuthProvider.");
  }
  return context;
};
