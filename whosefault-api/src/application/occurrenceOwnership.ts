import type { Occurrence } from '../domain/occurrence.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';

export class UnauthorizedOccurrenceAccessError extends Error {
  constructor() {
    super('Autenticação obrigatória para acessar esta ocorrência.');
    this.name = 'UnauthorizedOccurrenceAccessError';
  }
}

export function assertOccurrenceOwnership(
  occurrence: Occurrence,
  requesterUserId?: string,
): void {
  if (!occurrence.userId) {
    return;
  }
  if (!requesterUserId) {
    throw new UnauthorizedOccurrenceAccessError();
  }
  if (occurrence.userId !== requesterUserId) {
    throw new OccurrenceNotFoundError(occurrence.id);
  }
}
