import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import { Occurrence } from '../domain/occurrence.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';

export const TITULO_GENERICO = 'Ocorrência sem descrição';

export interface IRetryTitleResult {
  id: string;
  title: string;
  titleGenerated: boolean;
}

/**
 * Caso de uso: Nova tentativa manual de geração de título.
 * Cobre CA-12.
 *
 * Pré-condições:
 *  - A ocorrência deve existir.
 *  - Deve possuir uma descrição.
 *  - O título atual deve ser o genérico.
 *
 * Se a IA gerar um título válido → substitui o genérico e persiste.
 * Se falhar → mantém o título e a descrição sem alterar.
 */
export async function retryTitleGeneration(
  id: string,
  repo: IOccurrenceRepository,
  titleGenerator: ITitleGenerator,
): Promise<IRetryTitleResult> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw new OccurrenceNotFoundError(id);
  }

  // Pré-condições da CA-12
  if (!existing.description) {
    throw new Error('A ocorrência não possui descrição para gerar um título.');
  }
  if (existing.title !== TITULO_GENERICO) {
    throw new Error('O título atual não é o genérico; nova tentativa não é necessária.');
  }

  let newTitle = TITULO_GENERICO;
  let titleGenerated = false;

  try {
    const aiTitle = await titleGenerator.generate(existing.description);
    if (aiTitle && aiTitle.trim().length > 0) {
      newTitle = aiTitle.trim();
      titleGenerated = true;
    }
  } catch {
    // Falha na IA → mantém o título genérico (CA-12 caminho de falha)
  }

  if (titleGenerated) {
    const updated = Occurrence.create({
      id: existing.id,
      apiName: existing.apiName,
      url: existing.url,
      method: existing.method,
      description: existing.description,
      title: newTitle,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });
    await repo.update(updated);
  }

  return { id: existing.id, title: newTitle, titleGenerated };
}
