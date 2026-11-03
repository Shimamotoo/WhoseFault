import {
  ALLOWED_IMAGE_MIME_TYPES,
  EVIDENCE_LIMITS,
  Evidence,
} from '../domain/evidence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import type { IStorageService } from '../domain/services/IStorageService.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';
import { InMemoryOccurrenceRepository } from '../infra/repositories/occurrenceRepository.js';
import { diagnosisRepository as inMemoryDiagnosisRepository } from '../infra/repositories/diagnosisRepository.js';
import { prismaDiagnosisRepository } from '../infra/repositories/prismaDiagnosisRepository.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';
import { mapEvidenceToResult, type IEvidenceResult } from './createEvidence.js';

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export interface ICreateImageEvidenceInput {
  occurrenceId: string;
  userId?: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  notes?: string;
}

function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? 'image';
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'image';
}

/**
 * Caso de uso: Registrar evidência do tipo IMAGE via upload para GCP Storage (SPEC-08 RF-01 a RF-03, RF-07, CA-01 a CA-03, CA-08).
 */
export async function createImageEvidence(
  input: ICreateImageEvidenceInput,
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  storageService: IStorageService,
  secretDetector: ISecretDetector = defaultSecretDetector,
  diagnosisRepo?: IDiagnosisRepository,
): Promise<IEvidenceResult> {
  const occurrence = await occurrenceRepo.findById(input.occurrenceId);
  if (!occurrence) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  if (input.userId && occurrence.userId && occurrence.userId !== input.userId) {
    throw new OccurrenceNotFoundError(input.occurrenceId);
  }

  const normalizedMime = (input.mimeType ?? '').toLowerCase().trim();
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(normalizedMime)) {
    throw new ImageValidationError(
      'Formato de arquivo inválido. Apenas imagens JPEG, PNG e WEBP são permitidas.',
    );
  }

  if (!input.buffer || input.buffer.length === 0) {
    throw new ImageValidationError('O arquivo de imagem enviado está vazio.');
  }

  if (input.buffer.length > EVIDENCE_LIMITS.MAX_IMAGE_SIZE_BYTES) {
    throw new ImageValidationError(
      'O arquivo excede o limite máximo permitido de 5MB por imagem.',
    );
  }

  const trimmedNotes =
    input.notes !== undefined && input.notes.trim() !== '' ? input.notes.trim() : undefined;

  if (trimmedNotes !== undefined && trimmedNotes.length > EVIDENCE_LIMITS.MAX_NOTE_LENGTH) {
    throw new ImageValidationError(
      `Observações excedem o limite máximo de ${EVIDENCE_LIMITS.MAX_NOTE_LENGTH} caracteres.`,
    );
  }

  const safeFilename = sanitizeFilename(input.filename || 'captura');
  const metadataHeaders: Record<string, string> = {
    contentType: normalizedMime,
    sizeBytes: String(input.buffer.length),
    filename: safeFilename,
  };

  // CA-08: Inspeciona segredos ANTES de realizar o upload para o GCP Storage
  secretDetector.assertNoSecrets({
    headers: metadataHeaders,
    notes: trimmedNotes,
  });

  // RF-02: Verifica limite máximo de 5 imagens por ocorrência
  const existingEvidences = await evidenceRepo.findByOccurrenceId(input.occurrenceId);
  const currentImageCount = existingEvidences.filter((ev) => ev.type === 'IMAGE').length;
  if (currentImageCount >= EVIDENCE_LIMITS.MAX_IMAGES_PER_OCCURRENCE) {
    throw new ImageValidationError(
      `Limite máximo de ${EVIDENCE_LIMITS.MAX_IMAGES_PER_OCCURRENCE} fotos por ocorrência atingido.`,
    );
  }

  const evidenceId = crypto.randomUUID();
  const uploaded = await storageService.uploadFile({
    occurrenceId: input.occurrenceId,
    evidenceId,
    filename: safeFilename,
    mimeType: normalizedMime,
    buffer: input.buffer,
  });

  try {
    const evidence = Evidence.create(
      {
        id: evidenceId,
        occurrenceId: input.occurrenceId,
        type: 'IMAGE',
        url: uploaded.storagePath,
        headers: metadataHeaders,
        notes: trimmedNotes,
      },
      secretDetector,
    );

    await evidenceRepo.save(evidence);

    const resolvedDiagnosisRepo =
      diagnosisRepo ??
      (occurrenceRepo instanceof InMemoryOccurrenceRepository
        ? inMemoryDiagnosisRepository
        : prismaDiagnosisRepository);

    await resolvedDiagnosisRepo.markAsOutdated(input.occurrenceId);

    return mapEvidenceToResult(evidence);
  } catch (err) {
    // Rollback compensatório no bucket caso a persistência relacional falhe
    try {
      await storageService.deleteFile(uploaded.storagePath);
    } catch {
      // Ignora erro secundário de limpeza
    }
    throw err;
  }
}
