import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';

export interface IDeleteOccurrenceInput {
  id: string;
  userId?: string;
}

/**
 * Caso de uso: Excluir ocorrência definitivamente.
 * Graças ao cascade do banco de dados (onDelete: Cascade),
 * evidências e diagnósticos associados são removidos automaticamente.
 */
export async function deleteOccurrence(
  input: IDeleteOccurrenceInput,
  repo: IOccurrenceRepository,
): Promise<void> {
  const existing = await repo.findById(input.id);
  if (!existing) {
    throw new OccurrenceNotFoundError(input.id);
  }

  // Se a ocorrência tem dono e quem requisitou não é o dono, oculta existência (404)
  if (input.userId && existing.userId && existing.userId !== input.userId) {
    throw new OccurrenceNotFoundError(input.id);
  }

  await repo.delete(input.id);
}
