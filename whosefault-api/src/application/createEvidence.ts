import { Evidence, type EvidenceType } from '../domain/evidence.js';
import type { HttpMethod } from '../domain/occurrence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';

export interface ICreateEvidenceInput {
  occurrenceId: string;
  type: EvidenceType;
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

export interface IEvidenceResult {
  id: string;
  occurrenceId: string;
  type: EvidenceType;
  method?: HttpMethod;
  url?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  payload?: string;
  body?: string;
  content?: string;
  context?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function mapEvidenceToResult(evidence: Evidence): IEvidenceResult {
  return {
    id: evidence.id,
    occurrenceId: evidence.occurrenceId,
    type: evidence.type,
    ...(evidence.method !== undefined ? { method: evidence.method } : {}),
    ...(evidence.url !== undefined ? { url: evidence.url } : {}),
    ...(evidence.statusCode !== undefined ? { statusCode: evidence.statusCode } : {}),
    ...(evidence.headers !== undefined ? { headers: evidence.headers } : {}),
    ...(evidence.payload !== undefined ? { payload: evidence.payload } : {}),
    ...(evidence.body !== undefined ? { body: evidence.body } : {}),
    ...(evidence.content !== undefined ? { content: evidence.content } : {}),
    ...(evidence.context !== undefined ? { context: evidence.context } : {}),
    ...(evidence.notes !== undefined ? { notes: evidence.notes } : {}),
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
  };
}

/**
 * Caso de uso: Registrar evidência em uma ocorrência existente (SPEC-03).
 * Cobre CA-01 a CA-07, CA-13, CA-14, CA-16, CA-17, RN-01 a RN-08, RN-11, RN-14, RN-15.
 */
export async function createEvidence(
  input: ICreateEvidenceInput,
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  secretDetector: ISecretDetector = defaultSecretDetector,
): Promise<IEvidenceResult> {
  const occurrence = await occurrenceRepo.findById(input.occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  const evidence = Evidence.create(
    {
      occurrenceId: input.occurrenceId,
      type: input.type,
      method: input.method,
      url: input.url,
      statusCode: input.statusCode,
      headers: input.headers,
      payload: input.payload,
      body: input.body,
      content: input.content,
      context: input.context,
      notes: input.notes,
    },
    secretDetector,
  );

  await evidenceRepo.save(evidence);

  return mapEvidenceToResult(evidence);
}
