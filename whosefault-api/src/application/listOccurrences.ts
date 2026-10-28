import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { Occurrence } from '../domain/occurrence.js';

export interface IListOccurrencesResult {
  id: string;
  userId?: string | null;
  apiName: string;
  method: string;
  url: string;
  title: string;
  createdAt: Date;
}

/**
 * Lista ocorrências ordenadas por data de criação (mais recente primeiro).
 * Opcionalmente filtra pelo usuário logado.
 */
export async function listOccurrences(
  repo: IOccurrenceRepository,
  userId?: string,
): Promise<IListOccurrencesResult[]> {
  const occurrences: Occurrence[] = await repo.findAll(userId);
  // Garantir ordenação decrescente
  const sorted = occurrences
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((o) => ({
      id: o.id,
      userId: o.userId,
      apiName: o.apiName,
      method: o.method,
      url: o.url,
      title: o.title ?? 'Ocorrência sem descrição',
      createdAt: o.createdAt,
    }));
  return sorted;
}
