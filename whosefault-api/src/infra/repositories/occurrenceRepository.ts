// src/infra/repositories/occurrenceRepository.ts
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { Occurrence } from '../../domain/occurrence.js';

/** Simple in‑memory implementation used while no persistence layer exists */
class InMemoryOccurrenceRepository implements IOccurrenceRepository {
  private store: Map<string, Occurrence> = new Map();

  async findAll(): Promise<Occurrence[]> {
    return Array.from(this.store.values());
  }

  async findById(id: string): Promise<Occurrence | null> {
    return this.store.get(id) ?? null;
  }

  /** Helper used by tests / seed scripts */
  async save(occurrence: Occurrence): Promise<void> {
    this.store.set(occurrence.id, occurrence);
  }

  /** Clear all stored data – used by tests */
  clear(): void {
    this.store.clear();
  }

  // private store: Map<string, Occurrence> = new Map();

  // async findAll(): Promise<Occurrence[]> {
  //   return Array.from(this.store.values());
  // }

  // async findById(id: string): Promise<Occurrence | null> {
  //   return this.store.get(id) ?? null;
  // }

  // /** Helper used by tests / seed scripts */
  // async save(occurrence: Occurrence): Promise<void> {
  //   this.store.set(occurrence.id, occurrence);
  // }
}

export const occurrenceRepository = new InMemoryOccurrenceRepository();
