// src/infra/repositories/evidenceRepository.ts
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import type { Evidence } from '../../domain/evidence.js';

/** Implementação in-memory utilizada enquanto não há camada de persistência real */
export class InMemoryEvidenceRepository implements IEvidenceRepository {
  private store: Map<string, Evidence> = new Map();

  async findByOccurrenceId(occurrenceId: string): Promise<Evidence[]> {
    return Array.from(this.store.values()).filter(
      (evidence) => evidence.occurrenceId === occurrenceId,
    );
  }

  async findById(id: string): Promise<Evidence | null> {
    return this.store.get(id) ?? null;
  }

  async save(evidence: Evidence): Promise<void> {
    this.store.set(evidence.id, evidence);
  }

  async update(evidence: Evidence): Promise<void> {
    this.store.set(evidence.id, evidence);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  /** Remove todos os dados armazenados — usado nos testes */
  clear(): void {
    this.store.clear();
  }
}

export const evidenceRepository = new InMemoryEvidenceRepository();
