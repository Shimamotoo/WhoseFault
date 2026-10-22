import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
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
): Promise<void> {
  if (input.confirmed !== true) {
    throw new DeleteConfirmationRequiredError();
  }

  const occurrence = await occurrenceRepo.findById(input.occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  const existing = await evidenceRepo.findById(input.evidenceId);
  if (!existing || existing.occurrenceId !== input.occurrenceId) {
    throw new EvidenceNotFoundError(input.evidenceId);
  }

  await evidenceRepo.delete(existing.id);
}
