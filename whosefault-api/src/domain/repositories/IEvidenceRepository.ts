import type { Evidence } from '../evidence.js';

export interface IEvidenceRepository {
  /** Retorna todas as evidências associadas a uma ocorrência. */
  findByOccurrenceId(occurrenceId: string): Promise<Evidence[]>;

  /** Busca uma evidência pelo seu identificador único. */
  findById(id: string): Promise<Evidence | null>;

  /** Persiste uma nova evidência. */
  save(evidence: Evidence): Promise<void>;

  /** Atualiza uma evidência existente. */
  update(evidence: Evidence): Promise<void>;

  /** Exclui definitivamente uma evidência pelo seu identificador. */
  delete(id: string): Promise<void>;
}
