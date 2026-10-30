import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Diagnosis,
  Evidence,
  EvidenceType,
  HttpMethod,
  Occurrence,
} from "@/types/domain";
import * as api from "@/services/api";
import { useAuth } from "@/context/AuthContext";

const GENERIC_TITLE = "Ocorrência sem descrição";
const TITLE_POLL_MAX_ATTEMPTS = 7;
const TITLE_POLL_INTERVAL_MS = 2000;

export interface CreateOccurrenceInput {
  apiName: string;
  url: string;
  method: HttpMethod;
  description?: string;
}

export interface UpdateOccurrenceInput {
  apiName?: string;
  url?: string;
  method?: HttpMethod;
  description?: string;
}

export interface CreateEvidenceInput {
  occurrenceId: string;
  type: EvidenceType;
  method?: HttpMethod;
  url?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  payload?: string;
  body?: string;
  content?: string;
  context?: string;
  notes?: string;
}

export type ApiConnectivityStatus = "checking" | "online" | "offline";

interface OccurrencesContextValue {
  occurrences: Occurrence[];
  evidencesByOccurrence: Record<string, Evidence[]>;
  diagnosesByOccurrence: Record<string, Diagnosis>;
  pollingTitleIds: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  apiStatus: ApiConnectivityStatus;
  refreshOccurrences: () => Promise<void>;
  loadOccurrenceDetails: (occurrenceId: string) => Promise<void>;
  createOccurrence: (input: CreateOccurrenceInput) => Promise<Occurrence>;
  updateOccurrence: (
    id: string,
    input: UpdateOccurrenceInput,
  ) => Promise<Occurrence>;
  deleteOccurrence: (id: string) => Promise<void>;
  retryTitleGeneration: (id: string) => Promise<Occurrence>;
  addEvidence: (input: CreateEvidenceInput) => Promise<Evidence>;
  deleteEvidence: (occurrenceId: string, evidenceId: string) => Promise<void>;
  requestDiagnosis: (occurrenceId: string) => Promise<Diagnosis>;
}

const OccurrencesContext = createContext<OccurrencesContextValue | undefined>(
  undefined,
);

export const OccurrencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, profile } = useAuth();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [evidencesByOccurrence, setEvidencesByOccurrence] = useState<
    Record<string, Evidence[]>
  >({});
  const [diagnosesByOccurrence, setDiagnosesByOccurrence] = useState<
    Record<string, Diagnosis>
  >({});
  const [pollingTitleIds, setPollingTitleIds] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] =
    useState<ApiConnectivityStatus>("checking");

  const occurrencesRef = useRef<Occurrence[]>([]);
  useEffect(() => {
    occurrencesRef.current = occurrences;
  }, [occurrences]);

  const pollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const stopTitlePolling = useCallback((occurrenceId: string) => {
    const timer = pollTimersRef.current.get(occurrenceId);
    if (timer !== undefined) {
      clearTimeout(timer);
      pollTimersRef.current.delete(occurrenceId);
    }
    setPollingTitleIds((prev) => {
      if (!prev[occurrenceId]) return prev;
      const next = { ...prev };
      delete next[occurrenceId];
      return next;
    });
  }, []);

  const clearAllTitlePolling = useCallback(() => {
    for (const timer of pollTimersRef.current.values()) {
      clearTimeout(timer);
    }
    pollTimersRef.current.clear();
    setPollingTitleIds({});
  }, []);

  useEffect(() => {
    const timers = pollTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  /**
   * Inicia um polling curto (SPEC-07 RF-06 / CA-06: 3 tentativas a cada 2s)
   * consultando GET /occurrences/:id até que o título deixe de ser genérico ou expire.
   */
  const pollOccurrenceTitle = useCallback(
    (
      occurrenceId: string,
      maxAttempts: number = TITLE_POLL_MAX_ATTEMPTS,
      intervalMs: number = TITLE_POLL_INTERVAL_MS,
    ) => {
      stopTitlePolling(occurrenceId);
      setPollingTitleIds((prev) => ({ ...prev, [occurrenceId]: true }));

      const scheduleAttempt = (attempt: number) => {
        const timer = setTimeout(async () => {
          pollTimersRef.current.delete(occurrenceId);
          try {
            const latest = await api.getOccurrence(occurrenceId);
            setOccurrences((prev) =>
              prev.map((occ) => (occ.id === occurrenceId ? latest : occ)),
            );

            if (latest.title !== GENERIC_TITLE) {
              stopTitlePolling(occurrenceId);
              return;
            }
          } catch {
            // Falha transitória na consulta não interrompe o fluxo da UI
          }

          if (attempt < maxAttempts) {
            scheduleAttempt(attempt + 1);
          } else {
            stopTitlePolling(occurrenceId);
          }
        }, intervalMs);

        pollTimersRef.current.set(occurrenceId, timer);
      };

      scheduleAttempt(1);
    },
    [stopTitlePolling],
  );

  const markDiagnosisOutdated = useCallback((occurrenceId: string) => {
    setDiagnosesByOccurrence((prev) => {
      const current = prev[occurrenceId];
      if (!current) return prev;
      return {
        ...prev,
        [occurrenceId]: {
          ...current,
          isOutdated: true,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const refreshOccurrences = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setApiStatus("checking");

    try {
      const list = await api.getOccurrences();
      setOccurrences(list);
      setApiStatus("online");

      // Carrega evidências e diagnósticos associados para exibir nos cards
      await Promise.all(
        list.map(async (occ) => {
          try {
            const [evs, diag] = await Promise.all([
              api.getEvidences(occ.id),
              api.getDiagnosis(occ.id),
            ]);
            setEvidencesByOccurrence((prev) => ({ ...prev, [occ.id]: evs }));
            if (diag) {
              setDiagnosesByOccurrence((prev) => ({ ...prev, [occ.id]: diag }));
            }
          } catch {
            // Falha pontual em metadado secundário não derruba a listagem
          }
        }),
      );
    } catch (err) {
      if (err instanceof api.ApiError) {
        setApiStatus("online");
      } else {
        setApiStatus("offline");
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível conectar ao servidor da API.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void refreshOccurrences();
    } else {
      clearAllTitlePolling();
      setOccurrences([]);
      setEvidencesByOccurrence({});
      setDiagnosesByOccurrence({});
      setIsLoading(false);
    }
  }, [user, profile?.id, refreshOccurrences, clearAllTitlePolling]);

  const loadOccurrenceDetails = useCallback(async (occurrenceId: string) => {
    try {
      const [occ, evs, diag] = await Promise.all([
        api.getOccurrence(occurrenceId),
        api.getEvidences(occurrenceId),
        api.getDiagnosis(occurrenceId),
      ]);
      setApiStatus("online");
      setOccurrences((prev) => {
        const exists = prev.some((o) => o.id === occ.id);
        if (!exists) return [occ, ...prev];
        return prev.map((o) => (o.id === occ.id ? occ : o));
      });
      setEvidencesByOccurrence((prev) => ({ ...prev, [occurrenceId]: evs }));
      if (diag) {
        setDiagnosesByOccurrence((prev) => ({ ...prev, [occurrenceId]: diag }));
      } else {
        setDiagnosesByOccurrence((prev) => {
          if (!(occurrenceId in prev)) return prev;
          const next = { ...prev };
          delete next[occurrenceId];
          return next;
        });
      }
    } catch (err) {
      if (!(err instanceof api.ApiError)) {
        setApiStatus("offline");
      }
      throw err;
    }
  }, []);

  const createOccurrence = useCallback(
    async (input: CreateOccurrenceInput): Promise<Occurrence> => {
      const trimmedDescription = input.description?.trim() || undefined;
      const created = await api.createOccurrence({
        apiName: input.apiName.trim(),
        url: input.url.trim(),
        method: input.method,
        description: trimmedDescription,
      });

      setApiStatus("online");
      setOccurrences((prev) => [
        created,
        ...prev.filter((o) => o.id !== created.id),
      ]);
      setEvidencesByOccurrence((prev) => ({ ...prev, [created.id]: [] }));

      // SPEC-07 RF-06 / CA-06: dispara polling curto quando há descrição e título genérico
      if (trimmedDescription && created.title === GENERIC_TITLE) {
        pollOccurrenceTitle(created.id);
      }

      return created;
    },
    [pollOccurrenceTitle],
  );

  const updateOccurrence = useCallback(
    async (id: string, input: UpdateOccurrenceInput): Promise<Occurrence> => {
      const existing = occurrencesRef.current.find((occ) => occ.id === id);
      const hadDescription = Boolean(
        existing?.description && existing.description.trim() !== "",
      );
      const nextDescription =
        input.description !== undefined ? input.description.trim() : undefined;
      const addingDescriptionFirstTime =
        !hadDescription && Boolean(nextDescription && nextDescription !== "");

      const updated = await api.updateOccurrence(id, {
        apiName: input.apiName?.trim(),
        url: input.url?.trim(),
        method: input.method,
        description: nextDescription,
      });

      setApiStatus("online");
      setOccurrences((prev) =>
        prev.map((occ) => (occ.id === id ? updated : occ)),
      );
      markDiagnosisOutdated(id);

      // SPEC-07 RF-02 / RF-06: acompanha geração assíncrona na primeira inclusão de descrição
      if (addingDescriptionFirstTime && updated.title === GENERIC_TITLE) {
        pollOccurrenceTitle(id);
      }

      return updated;
    },
    [markDiagnosisOutdated, pollOccurrenceTitle],
  );

  
  const deleteOccurrence = useCallback(
    async (id: string): Promise<void> => {
      stopTitlePolling(id);
      await api.deleteOccurrence(id);
      setOccurrences((prev) => prev.filter((occ) => occ.id !== id));
      setEvidencesByOccurrence((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDiagnosesByOccurrence((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [stopTitlePolling],
  );

  const retryTitleGeneration = useCallback(
    async (id: string): Promise<Occurrence> => {
      stopTitlePolling(id);
      const updated = await api.retryTitleGeneration(id);
      setApiStatus("online");
      setOccurrences((prev) =>
        prev.map((occ) => (occ.id === id ? updated : occ)),
      );
      return updated;
    },
    [stopTitlePolling],
  );

  const addEvidence = useCallback(
    async (input: CreateEvidenceInput): Promise<Evidence> => {
      const created = await api.createEvidence(input.occurrenceId, {
        type: input.type,
        method: input.type === "HTTP_REQUEST" ? input.method : undefined,
        url: input.type === "HTTP_REQUEST" ? input.url?.trim() : undefined,
        statusCode:
          input.type === "HTTP_RESPONSE" ? input.statusCode : undefined,
        headers:
          input.type === "HTTP_REQUEST" || input.type === "HTTP_RESPONSE"
            ? input.headers
            : undefined,
        payload: input.type === "HTTP_REQUEST" ? input.payload : undefined,
        body: input.type === "HTTP_RESPONSE" ? input.body : undefined,
        content:
          input.type === "ERROR_LOG" || input.type === "MANUAL_NOTE"
            ? input.content
            : undefined,
        context: input.type === "ERROR_LOG" ? input.context : undefined,
        notes:
          input.type === "HTTP_REQUEST" || input.type === "HTTP_RESPONSE"
            ? input.notes
            : undefined,
      });

      setApiStatus("online");
      setEvidencesByOccurrence((prev) => ({
        ...prev,
        [input.occurrenceId]: [...(prev[input.occurrenceId] ?? []), created],
      }));
      markDiagnosisOutdated(input.occurrenceId);
      return created;
    },
    [markDiagnosisOutdated],
  );

  const deleteEvidence = useCallback(
    async (occurrenceId: string, evidenceId: string): Promise<void> => {
      await api.deleteEvidence(occurrenceId, evidenceId);
      setApiStatus("online");
      setEvidencesByOccurrence((prev) => ({
        ...prev,
        [occurrenceId]: (prev[occurrenceId] ?? []).filter(
          (ev) => ev.id !== evidenceId,
        ),
      }));
      markDiagnosisOutdated(occurrenceId);
    },
    [markDiagnosisOutdated],
  );

  const requestDiagnosis = useCallback(
    async (occurrenceId: string): Promise<Diagnosis> => {
      const diagnosis = await api.requestDiagnosis(occurrenceId);
      setApiStatus("online");
      setDiagnosesByOccurrence((prev) => ({
        ...prev,
        [occurrenceId]: diagnosis,
      }));
      return diagnosis;
    },
    [],
  );

  return (
    <OccurrencesContext.Provider
      value={{
        occurrences,
        evidencesByOccurrence,
        diagnosesByOccurrence,
        pollingTitleIds,
        isLoading,
        error,
        apiStatus,
        refreshOccurrences,
        loadOccurrenceDetails,
        createOccurrence,
        updateOccurrence,
        deleteOccurrence,
        retryTitleGeneration,
        addEvidence,
        deleteEvidence,
        requestDiagnosis,
      }}
    >
      {children}
    </OccurrencesContext.Provider>
  );
};

export function useOccurrences(): OccurrencesContextValue {
  const ctx = useContext(OccurrencesContext);
  if (!ctx) {
    throw new Error(
      "useOccurrences deve ser utilizado dentro de um OccurrencesProvider",
    );
  }
  return ctx;
}
