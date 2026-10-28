import type { Occurrence } from '../occurrence.js';

export interface IOccurrenceRepository {
  /** Retorna todas as ocorrências armazenadas, opcionalmente filtradas por usuário. */
  findAll(userId?: string): Promise<Occurrence[]>;

  /** Busca uma ocorrência pelo seu identificador. */
  findById(id: string): Promise<Occurrence | null>;

  /** Persiste uma nova ocorrência. */
  save(occurrence: Occurrence): Promise<void>;

  /** Atualiza uma ocorrência existente. */
  update(occurrence: Occurrence): Promise<void>;
}
