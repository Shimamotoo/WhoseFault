import type { HttpMethod } from './occurrence.js';
import type { EvidenceType } from './evidence.js';

export interface DiagnosisHypothesis {
  cause: string;
  evidence_support: string;
}

export interface DiagnosisResult {
  facts_observed: string[];
  hypotheses: DiagnosisHypothesis[];
  missing_information: string[];
}

export interface DiagnosisEvidenceSnapshot {
  id: string;
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

export interface DiagnosisContext {
  occurrence: {
    id: string;
    apiName: string;
    url: string;
    method: HttpMethod;
    description?: string;
  };
  evidences: DiagnosisEvidenceSnapshot[];
}

export interface DiagnosisProps {
  id?: string;
  occurrenceId: string;
  context: DiagnosisContext;
  result: DiagnosisResult;
  isOutdated?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Diagnosis {
  readonly id: string;
  readonly occurrenceId: string;
  readonly context: DiagnosisContext;
  readonly result: DiagnosisResult;
  readonly isOutdated: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    id: string;
    occurrenceId: string;
    context: DiagnosisContext;
    result: DiagnosisResult;
    isOutdated: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.occurrenceId = props.occurrenceId;
    this.context = props.context;
    this.result = props.result;
    this.isOutdated = props.isOutdated;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: DiagnosisProps): Diagnosis {
    if (!props.occurrenceId || props.occurrenceId.trim() === '') {
      throw new Error('Identificador da ocorrência é obrigatório para o diagnóstico.');
    }

    const now = new Date();
    const id = props.id ?? crypto.randomUUID();
    const createdAt = props.createdAt ?? now;
    const updatedAt = props.updatedAt ?? createdAt;

    return new Diagnosis({
      id,
      occurrenceId: props.occurrenceId.trim(),
      context: props.context,
      result: props.result,
      isOutdated: props.isOutdated ?? false,
      createdAt,
      updatedAt,
    });
  }
}
