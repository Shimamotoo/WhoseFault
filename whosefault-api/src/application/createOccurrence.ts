import { Occurrence } from '../domain/occurrence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { ITitleGenerator } from '../domain/services/ITitleGenerator.js';
import type { HttpMethod } from '../domain/occurrence.js';

export interface ICreateOccurrenceInput {
  userId?: string | null;
  apiName: string;
  url: string;
  method: HttpMethod;
  description?: string;
}

export interface ICreateOccurrenceResult {
  id: string;
  userId?: string | null;
  apiName: string;
  url: string;
  method: string;
  title: string;
  description?: string;
  createdAt: Date;
}

/**
 * Caso de uso: Criar ocorrência.
 * Cobre CA-01, CA-02, CA-03, CA-04, CA-05, CA-06, CA-07, CA-13.
 *
 * - Valida os dados via Occurrence.create() (erros de domínio propagam para a camada HTTP).
 * - Tenta gerar título via IA quando há descrição (CA-05).
 * - Em caso de falha da IA, usa o título genérico (CA-06 / CA-13).
 * - Persiste a ocorrência independentemente do resultado da IA.
 */
export async function createOccurrence(
  input: ICreateOccurrenceInput,
  repo: IOccurrenceRepository,
  titleGenerator: ITitleGenerator,
): Promise<ICreateOccurrenceResult> {
  let generatedTitle: string | undefined;

  // Tenta gerar título via IA apenas quando há descrição (CA-05 / CA-06)
  if (input.description) {
    try {
      const aiTitle = await titleGenerator.generate(input.description);
      if (aiTitle && aiTitle.trim().length > 0) {
        generatedTitle = aiTitle.trim();
      }
    } catch {
      // Falha na IA não impede a criação (CA-06 / CA-13)
    }
  }

  const occurrence = Occurrence.create({
    userId: input.userId,
    apiName: input.apiName,
    url: input.url,
    method: input.method,
    description: input.description,
    title: generatedTitle, // undefined → fallback 'Ocorrência sem descrição' no domínio
  });

  await repo.save(occurrence);

  return {
    id: occurrence.id,
    userId: occurrence.userId,
    apiName: occurrence.apiName,
    url: occurrence.url,
    method: occurrence.method,
    title: occurrence.title,
    description: occurrence.description,
    createdAt: occurrence.createdAt,
  };
}
