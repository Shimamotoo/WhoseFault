import { Occurrence } from '../domain/occurrence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import type { ITitleQueue } from '../domain/services/ITitleQueue.js';
import type { HttpMethod } from '../domain/occurrence.js';
import { InMemoryOccurrenceRepository } from '../infra/repositories/occurrenceRepository.js';
import { diagnosisRepository as inMemoryDiagnosisRepository } from '../infra/repositories/diagnosisRepository.js';
import { prismaDiagnosisRepository } from '../infra/repositories/prismaDiagnosisRepository.js';

export interface IUpdateOccurrenceInput {
  id: string;
  apiName?: string;
  url?: string;
  method?: HttpMethod;
  description?: string;
}

export interface IUpdateOccurrenceResult {
  id: string;
  apiName: string;
  url: string;
  method: string;
  title: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class OccurrenceNotFoundError extends Error {
  constructor(id: string) {
    super(`Ocorrência não encontrada: ${id}`);
    this.name = 'OccurrenceNotFoundError';
  }
}

/**
 * Caso de uso: Editar ocorrência.
 * Cobre SPEC-01 (CA-08 a CA-11) e SPEC-07 (RF-02, RNF-01).
 *
 * - Aplica apenas os campos informados (patch parcial — CA-08).
 * - Re-valida via Occurrence.create() com os valores mesclados (CA-09).
 * - Se description é adicionada PELA PRIMEIRA VEZ → preserva título atual e enfileira job assíncrono (SPEC-07 RF-02).
 * - Se description já existia e é editada → NÃO enfileira nem altera título (CA-11).
 */
export async function updateOccurrence(
  input: IUpdateOccurrenceInput,
  repo: IOccurrenceRepository,
  titleQueue: ITitleQueue,
  diagnosisRepo?: IDiagnosisRepository,
): Promise<IUpdateOccurrenceResult> {
  const existing = await repo.findById(input.id);
  if (!existing) {
    throw new OccurrenceNotFoundError(input.id);
  }

  const hadDescription =
    existing.description !== undefined && existing.description.trim() !== '';
  const newDescription =
    'description' in input ? input.description : existing.description;
  const addingDescriptionFirstTime =
    !hadDescription &&
    newDescription !== undefined &&
    newDescription.trim() !== '';

  // Mescla os campos (CA-08: preserva os não alterados, incluindo título atual)
  const updated = Occurrence.create({
    id: existing.id,
    userId: existing.userId,
    apiName: input.apiName ?? existing.apiName,
    url: input.url ?? existing.url,
    method: input.method ?? existing.method,
    description: newDescription,
    title: existing.title,
    createdAt: existing.createdAt,
    updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
  });

  await repo.update(updated);

  // SPEC-07 RF-02 / SPEC-01 CA-10: descrição adicionada pela primeira vez → enfileira geração assíncrona
  if (addingDescriptionFirstTime && newDescription) {
    try {
      await titleQueue.enqueue({
        occurrenceId: updated.id,
        description: newDescription,
      });
    } catch (err) {
      console.error('[updateOccurrence] Falha ao enfileirar job de geração de título:', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }

  const resolvedDiagnosisRepo =
    diagnosisRepo ??
    (repo instanceof InMemoryOccurrenceRepository
      ? inMemoryDiagnosisRepository
      : prismaDiagnosisRepository);

  await resolvedDiagnosisRepo.markAsOutdated(updated.id);

  return {
    id: updated.id,
    apiName: updated.apiName,
    url: updated.url,
    method: updated.method,
    title: updated.title,
    description: updated.description,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
