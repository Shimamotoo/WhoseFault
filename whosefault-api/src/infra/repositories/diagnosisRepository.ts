import { Diagnosis } from '../../domain/diagnosis.js';
import type {
  IDiagnosisRepository,
  UpsertDiagnosisInput,
} from '../../domain/repositories/IDiagnosisRepository.js';

/** Implementação in-memory de IDiagnosisRepository para testes de unidade e rotas */
export class InMemoryDiagnosisRepository implements IDiagnosisRepository {
  private store: Map<string, Diagnosis> = new Map();

  async findByOccurrenceId(occurrenceId: string): Promise<Diagnosis | null> {
    return this.store.get(occurrenceId) ?? null;
  }

  async upsert(input: UpsertDiagnosisInput): Promise<Diagnosis> {
    const existing = this.store.get(input.occurrenceId);
    const now = new Date();

    const diagnosis = Diagnosis.create({
      id: existing?.id ?? crypto.randomUUID(),
      occurrenceId: input.occurrenceId,
      context: input.context,
      result: input.result,
      isOutdated: input.isOutdated ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    this.store.set(input.occurrenceId, diagnosis);
    return diagnosis;
  }

  async markAsOutdated(occurrenceId: string): Promise<void> {
    const existing = this.store.get(occurrenceId);
    if (!existing) {
      return;
    }

    const updated = Diagnosis.create({
      id: existing.id,
      occurrenceId: existing.occurrenceId,
      context: existing.context,
      result: existing.result,
      isOutdated: true,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    this.store.set(occurrenceId, updated);
  }

  clear(): void {
    this.store.clear();
  }
}

export const diagnosisRepository = new InMemoryDiagnosisRepository();
