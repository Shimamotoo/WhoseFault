import { Occurrence } from '../domain/occurrence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IDiagnosisRepository } from '../domain/repositories/IDiagnosisRepository.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
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
 * Cobre CA-08, CA-09, CA-10, CA-11.
 *
 * - Aplica apenas os campos informados (patch parcial — CA-08).
 * - Re-valida via Occurrence.create() com os valores mesclados (CA-09).
 * - Se description é adicionada PELA PRIMEIRA VEZ → tenta gerar título (CA-10).
 * - Se description já existia e é editada → NÃO gera novo título (CA-11).
 */
export async function updateOccurrence(
  input: IUpdateOccurrenceInput,
  repo: IOccurrenceRepository,
  titleGenerator: ITitleGenerator,
  diagnosisRepo?: IDiagnosisRepository,
): Promise<IUpdateOccurrenceResult> {
  const existing = await repo.findById(input.id);
  if (!existing) {
    throw new OccurrenceNotFoundError(input.id);
  }

  const hadDescription = existing.description !== undefined && existing.description !== '';
  const newDescription = 'description' in input ? input.description : existing.description;
  const addingDescriptionFirstTime =
    !hadDescription && newDescription !== undefined && newDescription !== '';

  let newTitle = existing.title;

  // CA-10: descrição adicionada pela primeira vez → tenta gerar título
  if (addingDescriptionFirstTime && newDescription) {
    try {
      const aiTitle = await titleGenerator.generate(newDescription);
      if (aiTitle && aiTitle.trim().length > 0) {
        newTitle = aiTitle.trim();
      }
    } catch {
      // Falha na IA mantém o título atual
    }
  }
  // CA-11: descrição já existia → não altera título

  // Mescla os campos (CA-08: preserva os não alterados)
  const updated = Occurrence.create({
    id: existing.id,
    apiName: input.apiName ?? existing.apiName,
    url: input.url ?? existing.url,
    method: input.method ?? existing.method,
    description: newDescription,
    title: newTitle,
    createdAt: existing.createdAt,
    updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
  });

  await repo.update(updated);

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
