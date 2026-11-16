export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type TextEvidenceType = 'HTTP_REQUEST' | 'HTTP_RESPONSE' | 'ERROR_LOG' | 'MANUAL_NOTE';

export type EvidenceType = TextEvidenceType | 'IMAGE';

export interface OccurrenceDTO {
  id: string;
  userId?: string | null;
  apiName: string;
  method: HttpMethod;
  url: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EvidenceDTO {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosisHypothesisDTO {
  cause: string;
  evidence_support: string;
}

export interface DiagnosisResultDTO {
  facts_observed: string[];
  hypotheses: DiagnosisHypothesisDTO[];
  missing_information: string[];
}

export interface DiagnosisDTO {
  id: string;
  occurrenceId: string;
  context: unknown;
  result: DiagnosisResultDTO;
  isOutdated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OccurrenceDetailsDTO {
  occurrence: OccurrenceDTO;
  evidences: EvidenceDTO[];
  diagnosis: DiagnosisDTO | null;
}

export interface CreateOccurrenceInput {
  apiName: string;
  method: HttpMethod;
  url: string;
  description?: string;
}

export interface AddEvidenceInput {
  type: TextEvidenceType;
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

export interface EvidenceImageResult {
  data: string;
  mimeType: string;
}

export interface WhoseFaultApiErrorOptions {
  status: number;
  apiError?: string;
  guidance?: string;
  fields?: string[];
  discardedByConcurrency?: boolean;
}

export class WhoseFaultApiError extends Error {
  readonly status: number;
  readonly apiError?: string;
  readonly guidance?: string;
  readonly fields?: string[];
  readonly discardedByConcurrency?: boolean;

  constructor(options: WhoseFaultApiErrorOptions) {
    super(options.apiError ?? `Erro HTTP ${options.status} na whosefault-api.`);
    this.name = 'WhoseFaultApiError';
    this.status = options.status;
    this.apiError = options.apiError;
    this.guidance = options.guidance;
    this.fields = options.fields;
    this.discardedByConcurrency = options.discardedByConcurrency;
  }
}

export class WhoseFaultNetworkError extends Error {
  constructor(message = 'Não foi possível conectar à whosefault-api.') {
    super(message);
    this.name = 'WhoseFaultNetworkError';
  }
}

export interface WhoseFaultClientOptions {
  apiUrl: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

interface RawApiErrorPayload {
  error?: unknown;
  message?: unknown;
  guidance?: unknown;
  fields?: unknown;
  discardedByConcurrency?: unknown;
}

function parseErrorPayload(rawText: string): Omit<WhoseFaultApiErrorOptions, 'status'> {
  if (!rawText) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawText) as RawApiErrorPayload;
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    const apiError =
      typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.message === 'string'
          ? parsed.message
          : undefined;
    const guidance = typeof parsed.guidance === 'string' ? parsed.guidance : undefined;
    const fields = Array.isArray(parsed.fields)
      ? parsed.fields.filter((item): item is string => typeof item === 'string')
      : undefined;
    const discardedByConcurrency =
      typeof parsed.discardedByConcurrency === 'boolean'
        ? parsed.discardedByConcurrency
        : undefined;

    return { apiError, guidance, fields, discardedByConcurrency };
  } catch {
    return {};
  }
}

function buildEvidencePayload(input: AddEvidenceInput): Record<string, unknown> {
  switch (input.type) {
    case 'HTTP_REQUEST':
      return {
        type: input.type,
        method: input.method,
        url: input.url,
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
    case 'HTTP_RESPONSE':
      return {
        type: input.type,
        statusCode: input.statusCode,
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
    case 'ERROR_LOG':
      return {
        type: input.type,
        content: input.content,
        ...(input.context !== undefined ? { context: input.context } : {}),
      };
    case 'MANUAL_NOTE':
      return {
        type: input.type,
        content: input.content,
      };
  }
}

/**
 * Converte falhas da API ou de transporte em mensagens claras e acionáveis para clientes MCP (RF-07).
 * Nunca expõe tokens ou payloads sensíveis.
 */
export function formatMcpErrorMessage(error: unknown): string {
  if (error instanceof WhoseFaultApiError) {
    const isSecretGuardrail =
      error.status === 422 ||
      (error.status === 400 && Array.isArray(error.fields) && error.fields.length > 0);

    if (isSecretGuardrail) {
      const parts = [
        `Bloqueio de segurança (Secret Guardrail - HTTP ${error.status}): ${error.apiError ?? 'Segredos ou credenciais detectados no conteúdo enviado.'}`,
      ];
      if (error.fields && error.fields.length > 0) {
        parts.push(`Campos sinalizados: ${error.fields.join(', ')}`);
      }
      if (error.guidance) {
        parts.push(`Orientação: ${error.guidance}`);
      }
      parts.push(
        'Ação necessária: mascare os segredos (por exemplo, substituindo por [REDACTED]) ou solicite revisão ao usuário antes de tentar novamente.',
      );
      return parts.join('\n');
    }

    if (error.status === 401) {
      return `Falha de autenticação ou acesso negado (HTTP 401): ${error.apiError ?? 'Não autorizado.'} Verifique se o WHOSEFAULT_API_TOKEN é válido, não expirou e possui permissão para esta ocorrência.`;
    }

    if (error.status === 404) {
      return `Recurso não encontrado (HTTP 404): ${error.apiError ?? 'O occurrenceId ou evidenceId informado não foi encontrado para o usuário autenticado.'}`;
    }

    if (error.status === 409) {
      return `Conflito de concorrência (HTTP 409): ${error.apiError ?? 'A ocorrência ou suas evidências foram modificadas durante o processamento.'} Você pode solicitar a operação novamente.`;
    }

    if (error.status === 502 || error.status === 504) {
      return `Indisponibilidade ou timeout do provedor (HTTP ${error.status}): ${error.apiError ?? 'O provedor de IA, storage ou a whosefault-api falhou ao responder.'} Tente novamente em instantes.`;
    }

    return `Erro na requisição à whosefault-api (HTTP ${error.status}): ${error.apiError ?? error.message}`;
  }

  if (error instanceof WhoseFaultNetworkError) {
    return `Erro de conexão com a whosefault-api: ${error.message} Verifique se a API está em execução e acessível.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Erro desconhecido ao comunicar com a whosefault-api.';
}

/**
 * Cliente HTTP desacoplado para comunicação com a API REST do WhoseFault.
 */
export class WhoseFaultClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WhoseFaultClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private async executeFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.apiUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.apiToken}`);

    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      return await this.fetchImpl(url, {
        ...init,
        headers,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Falha de rede desconhecida.';
      throw new WhoseFaultNetworkError(`whosefault-api indisponível (${reason}).`);
    }
  }

  private async throwApiError(response: Response): Promise<never> {
    const rawText = await response.text().catch(() => '');
    const parsed = parseErrorPayload(rawText);
    throw new WhoseFaultApiError({
      status: response.status,
      apiError: parsed.apiError ?? (response.statusText || undefined),
      guidance: parsed.guidance,
      fields: parsed.fields,
      discardedByConcurrency: parsed.discardedByConcurrency,
    });
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.executeFetch(path, init);
    if (!response.ok) {
      await this.throwApiError(response);
    }

    return (await response.json()) as T;
  }

  async listOccurrences(): Promise<OccurrenceDTO[]> {
    const data = await this.requestJson<{ occurrences?: OccurrenceDTO[] }>('/occurrences', {
      method: 'GET',
    });
    return data.occurrences ?? [];
  }

  async getOccurrence(occurrenceId: string): Promise<OccurrenceDTO> {
    return this.requestJson<OccurrenceDTO>(
      `/occurrences/${encodeURIComponent(occurrenceId)}`,
      { method: 'GET' },
    );
  }

  async listEvidences(occurrenceId: string): Promise<EvidenceDTO[]> {
    const data = await this.requestJson<{ evidences?: EvidenceDTO[] }>(
      `/occurrences/${encodeURIComponent(occurrenceId)}/evidences`,
      { method: 'GET' },
    );
    return data.evidences ?? [];
  }

  async getDiagnosisOrNull(occurrenceId: string): Promise<DiagnosisDTO | null> {
    try {
      return await this.requestJson<DiagnosisDTO>(
        `/occurrences/${encodeURIComponent(occurrenceId)}/diagnosis`,
        { method: 'GET' },
      );
    } catch (err) {
      if (err instanceof WhoseFaultApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getOccurrenceDetails(occurrenceId: string): Promise<OccurrenceDetailsDTO> {
    // Busca a ocorrência primeiro para diferenciar 404 da ocorrência vs 404 de diagnóstico ausente.
    const occurrence = await this.getOccurrence(occurrenceId);
    const [evidences, diagnosis] = await Promise.all([
      this.listEvidences(occurrenceId),
      this.getDiagnosisOrNull(occurrenceId),
    ]);

    return {
      occurrence,
      evidences,
      diagnosis,
    };
  }

  async createOccurrence(input: CreateOccurrenceInput): Promise<OccurrenceDTO> {
    const body = {
      apiName: input.apiName,
      method: input.method,
      url: input.url,
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

    return this.requestJson<OccurrenceDTO>('/occurrences', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async addEvidence(occurrenceId: string, input: AddEvidenceInput): Promise<EvidenceDTO> {
    const payload = buildEvidencePayload(input);
    return this.requestJson<EvidenceDTO>(
      `/occurrences/${encodeURIComponent(occurrenceId)}/evidences`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  async generateDiagnosis(occurrenceId: string): Promise<DiagnosisDTO> {
    return this.requestJson<DiagnosisDTO>(
      `/occurrences/${encodeURIComponent(occurrenceId)}/diagnosis`,
      {
        method: 'POST',
      },
    );
  }

  async getEvidenceImage(occurrenceId: string, evidenceId: string): Promise<EvidenceImageResult> {
    const response = await this.executeFetch(
      `/occurrences/${encodeURIComponent(occurrenceId)}/evidences/${encodeURIComponent(evidenceId)}/image`,
      { method: 'GET' },
    );

    if (!response.ok) {
      await this.throwApiError(response);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');
    const rawContentType = response.headers.get('content-type') ?? 'image/png';
    const mimeType = rawContentType.split(';')[0]?.trim().toLowerCase() || 'image/png';

    return {
      data,
      mimeType,
    };
  }
}
