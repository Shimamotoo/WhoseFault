import { HTTP_METHODS, type HttpMethod } from './occurrence.js';
import { defaultSecretDetector } from './services/secretDetector.js';
import type { ISecretDetector } from './services/ISecretDetector.js';

export const EVIDENCE_TYPES = [
  'HTTP_REQUEST',
  'HTTP_RESPONSE',
  'ERROR_LOG',
  'MANUAL_NOTE',
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_LIMITS = {
  MAX_URL_LENGTH: 2048,
  MAX_NOTE_LENGTH: 2000,
  MAX_PAYLOAD_LOG_LENGTH: 65536,
  MAX_HEADERS_LENGTH: 8192,
  MIN_HTTP_STATUS: 100,
  MAX_HTTP_STATUS: 599,
} as const;

export interface EvidenceProps {
  id?: string;
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
  createdAt?: Date;
  updatedAt?: Date;
}

function validateHeaders(headers: unknown): Record<string, string> {
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    throw new Error('Cabeçalhos devem ser informados como um objeto chave-valor (Record<string, string>).');
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('As chaves dos cabeçalhos devem ser textos não vazios.');
    }
    if (typeof value !== 'string') {
      throw new Error(`O valor do cabeçalho "${key}" deve ser uma string.`);
    }
    normalized[key] = value;
  }

  const serializedLength = JSON.stringify(normalized).length;
  if (serializedLength > EVIDENCE_LIMITS.MAX_HEADERS_LENGTH) {
    throw new Error(
      `Os cabeçalhos excedem o limite máximo de ${EVIDENCE_LIMITS.MAX_HEADERS_LENGTH} caracteres.`,
    );
  }

  return normalized;
}

export class Evidence {
  readonly id: string;
  readonly occurrenceId: string;
  readonly type: EvidenceType;
  readonly method?: HttpMethod;
  readonly url?: string;
  readonly statusCode?: number;
  readonly headers?: Record<string, string>;
  readonly payload?: string;
  readonly body?: string;
  readonly content?: string;
  readonly context?: string;
  readonly notes?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
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
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.occurrenceId = props.occurrenceId;
    this.type = props.type;
    this.method = props.method;
    this.url = props.url;
    this.statusCode = props.statusCode;
    this.headers = props.headers ? { ...props.headers } : undefined;
    this.payload = props.payload;
    this.body = props.body;
    this.content = props.content;
    this.context = props.context;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(
    props: EvidenceProps,
    secretDetector: ISecretDetector = defaultSecretDetector,
  ): Evidence {
    if (!props.occurrenceId || props.occurrenceId.trim() === '') {
      throw new Error('Identificador da ocorrência é obrigatório.');
    }

    if (!props.type || !EVIDENCE_TYPES.includes(props.type)) {
      throw new Error(`Tipo de evidência inválido: ${String(props.type)}.`);
    }

    let validatedHeaders: Record<string, string> | undefined;
    if (props.headers !== undefined) {
      validatedHeaders = validateHeaders(props.headers);
    }

    if (props.type === 'HTTP_REQUEST') {
      if (!props.method) {
        throw new Error('Método HTTP é obrigatório para evidência de requisição HTTP.');
      }
      if (!HTTP_METHODS.includes(props.method)) {
        throw new Error(`Método HTTP inválido: ${props.method}.`);
      }
      if (!props.url || props.url.trim() === '') {
        throw new Error('URL é obrigatória para evidência de requisição HTTP.');
      }
      const trimmedUrl = props.url.trim();
      if (trimmedUrl.length > EVIDENCE_LIMITS.MAX_URL_LENGTH) {
        throw new Error(
          `URL excede o limite máximo de ${EVIDENCE_LIMITS.MAX_URL_LENGTH} caracteres.`,
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmedUrl);
      } catch {
        throw new Error('URL inválida.');
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('URL deve utilizar o protocolo HTTP ou HTTPS.');
      }

      if (
        props.payload !== undefined &&
        props.payload.length > EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH
      ) {
        throw new Error(
          `Payload excede o limite máximo de ${EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH} caracteres.`,
        );
      }

      if (props.notes !== undefined && props.notes.length > EVIDENCE_LIMITS.MAX_NOTE_LENGTH) {
        throw new Error(
          `Observações excedem o limite máximo de ${EVIDENCE_LIMITS.MAX_NOTE_LENGTH} caracteres.`,
        );
      }
    } else if (props.type === 'HTTP_RESPONSE') {
      if (props.statusCode === undefined || props.statusCode === null) {
        throw new Error('Status HTTP é obrigatório para evidência de resposta HTTP.');
      }
      if (
        typeof props.statusCode !== 'number' ||
        !Number.isInteger(props.statusCode) ||
        props.statusCode < EVIDENCE_LIMITS.MIN_HTTP_STATUS ||
        props.statusCode > EVIDENCE_LIMITS.MAX_HTTP_STATUS
      ) {
        throw new Error(
          `Status HTTP inválido: deve ser um número inteiro entre ${EVIDENCE_LIMITS.MIN_HTTP_STATUS} e ${EVIDENCE_LIMITS.MAX_HTTP_STATUS}.`,
        );
      }

      if (
        props.body !== undefined &&
        props.body.length > EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH
      ) {
        throw new Error(
          `Corpo da resposta excede o limite máximo de ${EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH} caracteres.`,
        );
      }

      if (props.notes !== undefined && props.notes.length > EVIDENCE_LIMITS.MAX_NOTE_LENGTH) {
        throw new Error(
          `Observações excedem o limite máximo de ${EVIDENCE_LIMITS.MAX_NOTE_LENGTH} caracteres.`,
        );
      }
    } else if (props.type === 'ERROR_LOG') {
      if (!props.content || props.content.trim() === '') {
        throw new Error('Conteúdo textual é obrigatório para evidência de log ou mensagem de erro.');
      }
      if (props.content.length > EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH) {
        throw new Error(
          `Conteúdo do log excede o limite máximo de ${EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH} caracteres.`,
        );
      }
      if (props.context !== undefined && props.context.length > EVIDENCE_LIMITS.MAX_NOTE_LENGTH) {
        throw new Error(
          `Contexto adicional excede o limite máximo de ${EVIDENCE_LIMITS.MAX_NOTE_LENGTH} caracteres.`,
        );
      }
    } else if (props.type === 'MANUAL_NOTE') {
      if (!props.content || props.content.trim() === '') {
        throw new Error('Conteúdo textual é obrigatório para evidência de observação manual.');
      }
      if (props.content.length > EVIDENCE_LIMITS.MAX_NOTE_LENGTH) {
        throw new Error(
          `Observação manual excede o limite máximo de ${EVIDENCE_LIMITS.MAX_NOTE_LENGTH} caracteres.`,
        );
      }
    }

    // Verificação de segurança antes de permitir a criação/persistência (RF-09 / RN-11 / CA-13)
    secretDetector.assertNoSecrets({
      url: props.url,
      headers: validatedHeaders,
      payload: props.payload,
      body: props.body,
      content: props.content,
      context: props.context,
      notes: props.notes,
    });

    const now = new Date();
    const id = props.id ?? crypto.randomUUID();
    const createdAt = props.createdAt ?? now;
    const updatedAt = props.updatedAt ?? createdAt;

    return new Evidence({
      id,
      occurrenceId: props.occurrenceId.trim(),
      type: props.type,
      method: props.type === 'HTTP_REQUEST' ? props.method : undefined,
      url: props.type === 'HTTP_REQUEST' ? props.url?.trim() : undefined,
      statusCode: props.type === 'HTTP_RESPONSE' ? props.statusCode : undefined,
      headers:
        props.type === 'HTTP_REQUEST' || props.type === 'HTTP_RESPONSE'
          ? validatedHeaders
          : undefined,
      payload: props.type === 'HTTP_REQUEST' ? props.payload : undefined,
      body: props.type === 'HTTP_RESPONSE' ? props.body : undefined,
      content:
        props.type === 'ERROR_LOG' || props.type === 'MANUAL_NOTE' ? props.content : undefined,
      context: props.type === 'ERROR_LOG' ? props.context : undefined,
      notes:
        props.type === 'HTTP_REQUEST' || props.type === 'HTTP_RESPONSE' ? props.notes : undefined,
      createdAt,
      updatedAt,
    });
  }
}
