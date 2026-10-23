import type { PrismaClient } from '@prisma/client';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import { Occurrence, type HttpMethod } from '../../domain/occurrence.js';
import { prisma as defaultPrisma } from '../prisma/client.js';

export class PrismaOccurrenceRepository implements IOccurrenceRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async findAll(): Promise<Occurrence[]> {
    const records = await this.db.occurrence.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) =>
      Occurrence.create({
        id: record.id,
        apiName: record.apiName,
        url: record.url,
        method: record.method as HttpMethod,
        description: record.description ?? undefined,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  }

  async findById(id: string): Promise<Occurrence | null> {
    const record = await this.db.occurrence.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return Occurrence.create({
      id: record.id,
      apiName: record.apiName,
      url: record.url,
      method: record.method as HttpMethod,
      description: record.description ?? undefined,
      title: record.title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async save(occurrence: Occurrence): Promise<void> {
    await this.db.occurrence.create({
      data: {
        id: occurrence.id,
        apiName: occurrence.apiName,
        url: occurrence.url,
        method: occurrence.method,
        description: occurrence.description ?? null,
        title: occurrence.title,
        createdAt: occurrence.createdAt,
        updatedAt: occurrence.updatedAt,
      },
    });
  }

  async update(occurrence: Occurrence): Promise<void> {
    await this.db.occurrence.update({
      where: { id: occurrence.id },
      data: {
        apiName: occurrence.apiName,
        url: occurrence.url,
        method: occurrence.method,
        description: occurrence.description ?? null,
        title: occurrence.title,
        updatedAt: occurrence.updatedAt,
      },
    });
  }
}

export const prismaOccurrenceRepository = new PrismaOccurrenceRepository();
