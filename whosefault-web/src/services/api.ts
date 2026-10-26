import type {
  Diagnosis,
  Evidence,
  EvidenceType,
  HttpMethod,
  Occurrence,
} from "@/types/domain";

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:3333/api";

export interface CreateOccurrenceDTO {
  apiName: string;
  url: string;
  method: HttpMethod;
  description?: string;
}

export interface UpdateOccurrenceDTO {
  apiName?: string;
  url?: string;
  method?: HttpMethod;
  description?: string;
}

export interface CreateEvidenceDTO {
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

export class ApiError extends Error {
  public readonly status: number;
  public readonly guidance?: string;
  public readonly fields?: string[];
  public readonly discardedByConcurrency?: boolean;

  constructor(
    message: string,
    status: number,
    options?: {
      guidance?: string;
      fields?: string[];
      discardedByConcurrency?: boolean;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.guidance = options?.guidance;
    this.fields = options?.fields;
    this.discardedByConcurrency = options?.discardedByConcurrency;
  }
}

function normalizeOccurrence(raw: Partial<Occurrence> & { id: string }): Occurrence {
  const createdAt =
    typeof raw.createdAt === "string"
      ? raw.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;

  return {
    id: raw.id,
    apiName: raw.apiName ?? "",
    url: raw.url ?? "",
    method: (raw.method as HttpMethod) ?? "GET",
    title: raw.title ?? "Ocorrência sem descrição",
    description: raw.description ?? undefined,
    createdAt,
    updatedAt,
  };
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handleErrorResponse(
  res: Response,
  fallbackMessage: string,
): Promise<never> {
  const data = await parseJsonSafe(res);
  const message =
    (typeof data.error === "string" && data.error) ||
    (typeof data.message === "string" && data.message) ||
    fallbackMessage;

  throw new ApiError(message, res.status, {
    guidance: typeof data.guidance === "string" ? data.guidance : undefined,
    fields: Array.isArray(data.fields) ? (data.fields as string[]) : undefined,
    discardedByConcurrency: Boolean(data.discardedByConcurrency),
  });
}

export async function getOccurrences(): Promise<Occurrence[]> {
  const res = await fetch(`${API_BASE_URL}/occurrences`);
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao carregar ocorrências.");
  }
  const data = (await res.json()) as { occurrences?: Array<Partial<Occurrence> & { id: string }> };
  return (data.occurrences ?? []).map(normalizeOccurrence);
}

export async function getOccurrence(id: string): Promise<Occurrence> {
  const res = await fetch(`${API_BASE_URL}/occurrences/${encodeURIComponent(id)}`);
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao carregar detalhes da ocorrência.");
  }
  const data = (await res.json()) as Partial<Occurrence> & { id: string };
  return normalizeOccurrence(data);
}

export async function createOccurrence(
  dto: CreateOccurrenceDTO,
): Promise<Occurrence> {
  const res = await fetch(`${API_BASE_URL}/occurrences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao criar ocorrência.");
  }
  const data = (await res.json()) as Partial<Occurrence> & { id: string };
  return normalizeOccurrence(data);
}

export async function updateOccurrence(
  id: string,
  dto: UpdateOccurrenceDTO,
): Promise<Occurrence> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    },
  );
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao editar ocorrência.");
  }
  const data = (await res.json()) as Partial<Occurrence> & { id: string };
  return normalizeOccurrence(data);
}

export async function retryTitleGeneration(id: string): Promise<Occurrence> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(id)}/retry-title`,
    {
      method: "POST",
    },
  );
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao tentar gerar título.");
  }
  return getOccurrence(id);
}

export async function getEvidences(occurrenceId: string): Promise<Evidence[]> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(occurrenceId)}/evidences`,
  );
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao carregar evidências.");
  }
  const data = (await res.json()) as { evidences?: Evidence[] };
  return data.evidences ?? [];
}

export async function createEvidence(
  occurrenceId: string,
  dto: CreateEvidenceDTO,
): Promise<Evidence> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(occurrenceId)}/evidences`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    },
  );
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao registrar evidência.");
  }
  return (await res.json()) as Evidence;
}

export async function deleteEvidence(
  occurrenceId: string,
  evidenceId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(occurrenceId)}/evidences/${encodeURIComponent(evidenceId)}?confirm=true`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao excluir evidência.");
  }
}

export async function getDiagnosis(
  occurrenceId: string,
): Promise<Diagnosis | null> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(occurrenceId)}/diagnosis`,
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao consultar diagnóstico.");
  }
  return (await res.json()) as Diagnosis;
}

export async function requestDiagnosis(
  occurrenceId: string,
): Promise<Diagnosis> {
  const res = await fetch(
    `${API_BASE_URL}/occurrences/${encodeURIComponent(occurrenceId)}/diagnosis`,
    {
      method: "POST",
    },
  );
  if (!res.ok) {
    await handleErrorResponse(res, "Falha ao solicitar diagnóstico.");
  }
  return (await res.json()) as Diagnosis;
}
