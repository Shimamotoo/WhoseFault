import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma/client.js';
import { User } from '../../domain/user.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async upsert(data: {
    firebaseUid: string;
    email?: string | null;
    name?: string | null;
    isAnonymous: boolean;
  }): Promise<User> {
    const raw = await this.prisma.user.upsert({
      where: { firebaseUid: data.firebaseUid },
      update: {
        email: data.email,
        name: data.name,
        isAnonymous: data.isAnonymous,
        updatedAt: new Date(),
      },
      create: {
        firebaseUid: data.firebaseUid,
        email: data.email,
        name: data.name,
        isAnonymous: data.isAnonymous,
      },
    });

    return User.create({
      id: raw.id,
      firebaseUid: raw.firebaseUid,
      email: raw.email,
      name: raw.name,
      isAnonymous: raw.isAnonymous,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });
    if (!raw) return null;
    return User.create({
      id: raw.id,
      firebaseUid: raw.firebaseUid,
      email: raw.email,
      name: raw.name,
      isAnonymous: raw.isAnonymous,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!raw) return null;
    return User.create({
      id: raw.id,
      firebaseUid: raw.firebaseUid,
      email: raw.email,
      name: raw.name,
      isAnonymous: raw.isAnonymous,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async findExpiredGuests(olderThan: Date): Promise<User[]> {
    const raws = await this.prisma.user.findMany({
      where: {
        isAnonymous: true,
        updatedAt: { lt: olderThan },
      },
    });
    return raws.map((raw) =>
      User.create({
        id: raw.id,
        firebaseUid: raw.firebaseUid,
        email: raw.email,
        name: raw.name,
        isAnonymous: raw.isAnonymous,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      }),
    );
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.prisma.user.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }
}

export const prismaUserRepository = new PrismaUserRepository();
