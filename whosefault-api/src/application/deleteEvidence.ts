import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import type { IStorageService } from '../domain/services/IStorageService.js';
import { InMemoryOccurrenceRepository } from '../infra/repositories/occurrenceRepository.js';
import { diagnosisRepository as inMemoryDiagnosisRepository } from '../infra/repositories/diagnosisRepository.js';
import { prismaDiagnosisRepository } from '../infra/repositories/prismaDiagnosisRepository.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
import { assertOccurrenceOwnership } from './occurrenceOwnership.js';
import { EvidenceNotFoundError } from './updateEvidence.js';

export class DeleteConfirmationRequiredError extends Error {
  constructor() {
    super(
      'A exclusão de uma evidência é definitiva e exige confirmação explícita (?confirm=true).',
    );
    this.name = 'DeleteConfirmationRequiredError';
  }
}

export interface IDeleteEvidenceInput {
  occurrenceId: string;
  evidenceId: string;
  confirmed: boolean;
  userId?: string;
}

/**
 * Caso de uso: Remover evidência definitivamente após confirmação (SPEC-03 RF-08, RN-10, CA-10, CA-11, CA-12).
 *
 * - Exige confirmação explícita (confirmed === true).
 * - Se não confirmado, cancela a operação sem excluir nada.
 * - Preserva a ocorrência e as demais evidências associadas.
 */
export async function deleteEvidence(
  input: IDeleteEvidenceInput,
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  diagnosisRepo?: IDiagnosisRepository,
  storageService?: IStorageService,
): Promise<void> {
  if (input.confirmed !== true) {
    throw new DeleteConfirmationRequiredError();
  }

  const occurrence = await occurrenceRepo.findById(input.occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  assertOccurrenceOwnership(occurrence, input.userId);

  const existing = await evidenceRepo.findById(input.evidenceId);
  if (!existing || existing.occurrenceId !== input.occurrenceId) {
    throw new EvidenceNotFoundError(input.evidenceId);
  }

  if (existing.type === 'IMAGE' && existing.url && storageService) {
    await storageService.deleteFile(existing.url);
  }

  await evidenceRepo.delete(existing.id);

  const resolvedDiagnosisRepo =
    diagnosisRepo ??
    (occurrenceRepo instanceof InMemoryOccurrenceRepository
      ? inMemoryDiagnosisRepository
      : prismaDiagnosisRepository);

  await resolvedDiagnosisRepo.markAsOutdated(input.occurrenceId);
}
