// src/infra/repositories/occurrenceRepository.ts
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import { Occurrence } from '../../domain/occurrence.js';

/** Implementação in-memory utilizada em testes de unidade e de rotas */
export class InMemoryOccurrenceRepository implements IOccurrenceRepository {
  private store: Map<string, Occurrence> = new Map();

  async findAll(userId?: string): Promise<Occurrence[]> {
    const all = Array.from(this.store.values());
    if (userId) {
      return all.filter((occ) => occ.userId === userId);
    }
    return all;
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

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async transferOwnership(fromUserId: string, toUserId: string): Promise<number> {
    let count = 0;
    for (const [id, occ] of this.store.entries()) {
      if (occ.userId === fromUserId) {
        const updated = Occurrence.create({
          id: occ.id,
          userId: toUserId,
          apiName: occ.apiName,
          url: occ.url,
          method: occ.method,
          description: occ.description,
          title: occ.title,
          createdAt: occ.createdAt,
          updatedAt: occ.updatedAt,
        });
        this.store.set(id, updated);
        count++;
      }
    }
    return count;
  }

  /** Remove todos os dados armazenados — usado nos testes */
  clear(): void {
    this.store.clear();
  }
}

export const occurrenceRepository = new InMemoryOccurrenceRepository();
