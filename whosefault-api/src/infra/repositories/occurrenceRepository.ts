// src/infra/repositories/occurrenceRepository.ts
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { Occurrence } from '../../domain/occurrence.js';

/** Implementação in-memory utilizada em testes de unidade e de rotas */
export class InMemoryOccurrenceRepository implements IOccurrenceRepository {
  private store: Map<string, Occurrence> = new Map();

  async findAll(): Promise<Occurrence[]> {
    return Array.from(this.store.values());
  }

  async findById(id: string): Promise<Occurrence | null> {
    return this.store.get(id) ?? null;
  }

  async save(occurrence: Occurrence): Promise<void> {
    this.store.set(occurrence.id, occurrence);
  }

  async update(occurrence: Occurrence): Promise<void> {
    this.store.set(occurrence.id, occurrence);
  }

  /** Remove todos os dados armazenados — usado nos testes */
  clear(): void {
    this.store.clear();
  }
}

export const occurrenceRepository = new InMemoryOccurrenceRepository();
