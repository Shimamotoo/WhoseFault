import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IStorageService } from '../domain/services/IStorageService.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
import { EvidenceNotFoundError } from './updateEvidence.js';
import { assertOccurrenceOwnership, UnauthorizedOccurrenceAccessError } from './occurrenceOwnership.js';

export { UnauthorizedOccurrenceAccessError as UnauthorizedEvidenceAccessError };

export class EvidenceNotAnImageError extends Error {
  constructor(id: string) {
    super(`A evidência informada não é do tipo imagem: ${id}`);
    this.name = 'EvidenceNotAnImageError';
  }
}

export interface IGetEvidenceImageInput {
  occurrenceId: string;
  evidenceId: string;
  userId?: string;
}

export interface IGetEvidenceImageOutput {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

/**
 * Caso de uso: Obter bytes e tipo MIME de uma evidência de imagem (SPEC-08 RF-04, CA-04).
 */
export async function getEvidenceImage(
  input: IGetEvidenceImageInput,
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  storageService: IStorageService,
): Promise<IGetEvidenceImageOutput> {
  const occurrence = await occurrenceRepo.findById(input.occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  assertOccurrenceOwnership(occurrence, input.userId);

  const evidence = await evidenceRepo.findById(input.evidenceId);
  if (!evidence || evidence.occurrenceId !== input.occurrenceId) {
    throw new EvidenceNotFoundError(input.evidenceId);
  }

  if (evidence.type !== 'IMAGE' || !evidence.url) {
    throw new EvidenceNotAnImageError(input.evidenceId);
  }

  const { buffer, mimeType } = await storageService.getFileBuffer(evidence.url);
  const resolvedMimeType = evidence.headers?.contentType || mimeType;

  return {
    buffer,
    mimeType: resolvedMimeType,
    filename: evidence.headers?.filename,
  };
}
