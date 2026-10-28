import { User } from '../../domain/user.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';

export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();

  async upsert(data: {
    firebaseUid: string;
    email?: string | null;
    name?: string | null;
    isAnonymous: boolean;
  }): Promise<User> {
    const existing = await this.findByFirebaseUid(data.firebaseUid);
    const now = new Date();

    if (existing) {
      const updated = User.create({
        id: existing.id,
        firebaseUid: existing.firebaseUid,
        email: data.email !== undefined ? data.email : existing.email,
        name: data.name !== undefined ? data.name : existing.name,
        isAnonymous: data.isAnonymous,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
      this.users.set(existing.id, updated);
      return updated;
    }

    const created = User.create({
      firebaseUid: data.firebaseUid,
      email: data.email,
      name: data.name,
      isAnonymous: data.isAnonymous,
      createdAt: now,
      updatedAt: now,
    });
    this.users.set(created.id, created);
    return created;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.firebaseUid === firebaseUid) {
        return user;
      }
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findExpiredGuests(olderThan: Date): Promise<User[]> {
    const expired: User[] = [];
    for (const user of this.users.values()) {
      if (user.isAnonymous && user.updatedAt < olderThan) {
        expired.push(user);
      }
    }
    return expired;
  }

  async deleteMany(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.users.delete(id)) {
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.users.clear();
  }
}

export const inMemoryUserRepository = new InMemoryUserRepository();
