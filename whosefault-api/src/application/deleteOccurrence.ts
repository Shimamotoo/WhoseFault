import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IStorageService } from '../domain/services/IStorageService.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
import { assertOccurrenceOwnership } from './occurrenceOwnership.js';

export interface IDeleteOccurrenceInput {
  id: string;
  userId?: string;
}

/**
 * Caso de uso: Excluir ocorrência definitivamente.
 * Graças ao cascade do banco de dados (onDelete: Cascade),
 * evidências e diagnósticos associados são removidos automaticamente.
 * Quando há evidências de imagem (SPEC-08 RF-06, CA-07), expurga também os arquivos físicos do storage.
 */
export async function deleteOccurrence(
  input: IDeleteOccurrenceInput,
  repo: IOccurrenceRepository,
  evidenceRepo?: IEvidenceRepository,
  storageService?: IStorageService,
): Promise<void> {
  const existing = await repo.findById(input.id);
  if (!existing) {
    throw new OccurrenceNotFoundError(input.id);
  }

  assertOccurrenceOwnership(existing, input.userId);

  if (evidenceRepo && storageService) {
    const evidences = await evidenceRepo.findByOccurrenceId(input.id);
    const imageEvidences = evidences.filter((ev) => ev.type === 'IMAGE' && ev.url);
    await Promise.all(
      imageEvidences.map((ev) => storageService.deleteFile(ev.url as string)),
    );
  }

  await repo.delete(input.id);
}
