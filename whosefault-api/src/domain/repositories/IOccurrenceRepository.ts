export interface IOccurrenceRepository {
  /**
   * Retorna todas as ocorrências armazenadas.
   */
  findAll(): Promise<import('../occurrence.js').Occurrence[]>;

  /**
   * Busca uma ocorrência pelo seu identificador.
   */
  findById(id: string): Promise<import('../occurrence.js').Occurrence | null>;
}
