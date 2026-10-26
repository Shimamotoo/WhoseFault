import type { Diagnosis, DiagnosisContext, DiagnosisResult } from '../diagnosis.js';

export interface UpsertDiagnosisInput {
  occurrenceId: string;
  context: DiagnosisContext;
  result: DiagnosisResult;
  isOutdated?: boolean;
}

export interface IDiagnosisRepository {
  /** Busca o diagnóstico associado a uma ocorrência (relação 1:1). */
  findByOccurrenceId(occurrenceId: string): Promise<Diagnosis | null>;

  /** Insere ou atualiza (UPSERT) o diagnóstico da ocorrência mantendo a relação 1:1. */
  upsert(input: UpsertDiagnosisInput): Promise<Diagnosis>;

  /** Marca o diagnóstico da ocorrência (se existir) como desatualizado (isOutdated = true). */
  markAsOutdated(occurrenceId: string): Promise<void>;
}
