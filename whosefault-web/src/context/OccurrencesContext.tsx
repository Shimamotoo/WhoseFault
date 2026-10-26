import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [evidencesByOccurrence, setEvidencesByOccurrence] = useState<
    Record<string, Evidence[]>
  >({});
  const [diagnosesByOccurrence, setDiagnosesByOccurrence] = useState<
    Record<string, Diagnosis>
  >({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] =
    useState<ApiConnectivityStatus>("checking");

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
      setApiStatus("offline");
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
    void refreshOccurrences();
  }, [refreshOccurrences]);

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
      const created = await api.createOccurrence({
        apiName: input.apiName.trim(),
        url: input.url.trim(),
        method: input.method,
        description: input.description?.trim() || undefined,
      });

      setApiStatus("online");
      setOccurrences((prev) => [
        created,
        ...prev.filter((o) => o.id !== created.id),
      ]);
      setEvidencesByOccurrence((prev) => ({ ...prev, [created.id]: [] }));
      return created;
    },
    [],
  );

  const updateOccurrence = useCallback(
    async (id: string, input: UpdateOccurrenceInput): Promise<Occurrence> => {
      const updated = await api.updateOccurrence(id, {
        apiName: input.apiName?.trim(),
        url: input.url?.trim(),
        method: input.method,
        description:
          input.description !== undefined
            ? input.description.trim()
            : undefined,
      });

      setApiStatus("online");
      setOccurrences((prev) =>
        prev.map((occ) => (occ.id === id ? updated : occ)),
      );
      markDiagnosisOutdated(id);
      return updated;
    },
    [markDiagnosisOutdated],
  );

  const retryTitleGeneration = useCallback(
    async (id: string): Promise<Occurrence> => {
      const updated = await api.retryTitleGeneration(id);
      setApiStatus("online");
      setOccurrences((prev) =>
        prev.map((occ) => (occ.id === id ? updated : occ)),
      );
      return updated;
    },
    [],
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
        isLoading,
        error,
        apiStatus,
        refreshOccurrences,
        loadOccurrenceDetails,
        createOccurrence,
        updateOccurrence,
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
