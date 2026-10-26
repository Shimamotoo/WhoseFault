import { Evidence } from '../domain/evidence.js';
import type { HttpMethod } from '../domain/occurrence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';
import { InMemoryOccurrenceRepository } from '../infra/repositories/occurrenceRepository.js';
import { diagnosisRepository as inMemoryDiagnosisRepository } from '../infra/repositories/diagnosisRepository.js';
import { prismaDiagnosisRepository } from '../infra/repositories/prismaDiagnosisRepository.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
import { mapEvidenceToResult, type IEvidenceResult } from './createEvidence.js';

export class EvidenceNotFoundError extends Error {
  constructor(id: string) {
    super(`Evidência não encontrada: ${id}`);
    this.name = 'EvidenceNotFoundError';
  }
}

export interface IUpdateEvidenceInput {
  occurrenceId: string;
  evidenceId: string;
  method?: HttpMethod;
  url?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  payload?: string;
  body?: string;
  content?: string;
  context?: string;
  notes?: string;
}

/**
 * Caso de uso: Editar evidência existente (SPEC-03 RF-07, RN-09, CA-09, CA-13).
 *
 * - Aplica atualização parcial preservando campos não submetidos e metadados imutáveis.
 * - Revalida as regras do tipo de evidência e a política de detecção de segredos.
 */
export async function updateEvidence(
  input: IUpdateEvidenceInput,
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  secretDetector: ISecretDetector = defaultSecretDetector,
  diagnosisRepo?: IDiagnosisRepository,
): Promise<IEvidenceResult> {
  const occurrence = await occurrenceRepo.findById(input.occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  const existing = await evidenceRepo.findById(input.evidenceId);
  if (!existing || existing.occurrenceId !== input.occurrenceId) {
    throw new EvidenceNotFoundError(input.evidenceId);
  }

  const updated = Evidence.create(
    {
      id: existing.id,
      occurrenceId: existing.occurrenceId,
      type: existing.type,
      method: 'method' in input && input.method !== undefined ? input.method : existing.method,
      url: 'url' in input && input.url !== undefined ? input.url : existing.url,
      statusCode:
        'statusCode' in input && input.statusCode !== undefined
          ? input.statusCode
          : existing.statusCode,
      headers: 'headers' in input && input.headers !== undefined ? input.headers : existing.headers,
      payload: 'payload' in input && input.payload !== undefined ? input.payload : existing.payload,
      body: 'body' in input && input.body !== undefined ? input.body : existing.body,
      content: 'content' in input && input.content !== undefined ? input.content : existing.content,
      context: 'context' in input && input.context !== undefined ? input.context : existing.context,
      notes: 'notes' in input && input.notes !== undefined ? input.notes : existing.notes,
      createdAt: existing.createdAt,
      updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
    },
    secretDetector,
  );

  await evidenceRepo.update(updated);

  const resolvedDiagnosisRepo =
    diagnosisRepo ??
    (occurrenceRepo instanceof InMemoryOccurrenceRepository
      ? inMemoryDiagnosisRepository
      : prismaDiagnosisRepository);

  await resolvedDiagnosisRepo.markAsOutdated(input.occurrenceId);

  return mapEvidenceToResult(updated);
}
