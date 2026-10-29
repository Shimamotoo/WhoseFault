import { Occurrence } from '../domain/occurrence.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { ITitleQueue } from '../domain/services/ITitleQueue.js';
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
 * Cobre SPEC-01 (CA-01 a CA-07, CA-13) e SPEC-07 (RF-01, RNF-01, CA-01, CA-02).
 *
 * - Valida os dados via Occurrence.create() (erros de domínio propagam para a camada HTTP).
 * - Persiste imediatamente a ocorrência com o título padrão ('Ocorrência sem descrição').
 * - Quando há descrição preenchida, despacha job assíncrono na fila `ITitleQueue` sem bloquear a resposta.
 */
export async function createOccurrence(
  input: ICreateOccurrenceInput,
  repo: IOccurrenceRepository,
  titleQueue: ITitleQueue,
): Promise<ICreateOccurrenceResult> {
  const occurrence = Occurrence.create({
    userId: input.userId,
    apiName: input.apiName,
    url: input.url,
    method: input.method,
    description: input.description,
    title: undefined, // fallback 'Ocorrência sem descrição' no domínio (SPEC-07 RF-01)
  });

  await repo.save(occurrence);

  if (input.description && input.description.trim().length > 0) {
    try {
      await titleQueue.enqueue({
        occurrenceId: occurrence.id,
        description: input.description,
      });
    } catch (err) {
      // Degradação graciosa: falha no broker não impede a persistência da ocorrência
      console.error('[createOccurrence] Falha ao enfileirar job de geração de título:', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }

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
