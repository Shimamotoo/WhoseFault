export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const EVIDENCE_TYPES = [
  "HTTP_REQUEST",
  "HTTP_RESPONSE",
  "ERROR_LOG",
  "MANUAL_NOTE",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface Evidence {
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

export interface DiagnosisHypothesis {
  cause: string;
  evidence_support: string;
}

export interface DiagnosisResult {
  facts_observed: string[];
  hypotheses: DiagnosisHypothesis[];
  missing_information: string[];
}

export interface Diagnosis {
  id: string;
  occurrenceId: string;
  result: DiagnosisResult;
  isOutdated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Occurrence {
  id: string;
  apiName: string;
  url: string;
  method: HttpMethod;
  description?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
