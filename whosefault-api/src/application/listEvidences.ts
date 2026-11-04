import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
import { assertOccurrenceOwnership } from './occurrenceOwnership.js';
import { mapEvidenceToResult, type IEvidenceResult } from './createEvidence.js';

/**
 * Caso de uso: Consultar evidências associadas a uma ocorrência (SPEC-03 RF-06, CA-08).
 */
export async function listEvidences(
  occurrenceId: string,
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  userId?: string,
): Promise<IEvidenceResult[]> {
  const occurrence = await occurrenceRepo.findById(occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(occurrenceId);
  }

  assertOccurrenceOwnership(occurrence, userId);

  const evidences = await evidenceRepo.findByOccurrenceId(occurrenceId);
  return evidences.map(mapEvidenceToResult);
}
