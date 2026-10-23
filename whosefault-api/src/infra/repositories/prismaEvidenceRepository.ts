import { Prisma, type PrismaClient } from '@prisma/client';
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import { Evidence, type EvidenceType } from '../../domain/evidence.js';
import type { HttpMethod } from '../../domain/occurrence.js';
import { prisma as defaultPrisma } from '../prisma/client.js';

export class PrismaEvidenceRepository implements IEvidenceRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async findByOccurrenceId(occurrenceId: string): Promise<Evidence[]> {
    const records = await this.db.evidence.findMany({
      where: { occurrenceId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => this.mapRecordToDomain(record));
  }

  async findById(id: string): Promise<Evidence | null> {
    const record = await this.db.evidence.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.mapRecordToDomain(record);
  }

  async save(evidence: Evidence): Promise<void> {
    await this.db.evidence.create({
      data: {
        id: evidence.id,
        occurrenceId: evidence.occurrenceId,
        type: evidence.type,
        method: evidence.method ?? null,
        url: evidence.url ?? null,
        statusCode: evidence.statusCode ?? null,
        headers: evidence.headers ? (evidence.headers as Prisma.InputJsonValue) : Prisma.JsonNull,
        payload: evidence.payload ?? null,
        body: evidence.body ?? null,
        content: evidence.content ?? null,
        context: evidence.context ?? null,
        notes: evidence.notes ?? null,
        createdAt: evidence.createdAt,
        updatedAt: evidence.updatedAt,
      },
    });
  }

  async update(evidence: Evidence): Promise<void> {
    await this.db.evidence.update({
      where: { id: evidence.id },
      data: {
        method: evidence.method ?? null,
        url: evidence.url ?? null,
        statusCode: evidence.statusCode ?? null,
        headers: evidence.headers ? (evidence.headers as Prisma.InputJsonValue) : Prisma.JsonNull,
        payload: evidence.payload ?? null,
        body: evidence.body ?? null,
        content: evidence.content ?? null,
        context: evidence.context ?? null,
        notes: evidence.notes ?? null,
        updatedAt: evidence.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.evidence.delete({
      where: { id },
    });
  }

  private mapRecordToDomain(record: {
    id: string;
    occurrenceId: string;
    type: EvidenceType;
    method: string | null;
    url: string | null;
    statusCode: number | null;
    headers: unknown;
    payload: string | null;
    body: string | null;
    content: string | null;
    context: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Evidence {
    const rawHeaders =
      record.headers && typeof record.headers === 'object' && !Array.isArray(record.headers)
        ? (record.headers as Record<string, string>)
        : undefined;

    return Evidence.create({
      id: record.id,
      occurrenceId: record.occurrenceId,
      type: record.type,
      method: (record.method as HttpMethod) ?? undefined,
      url: record.url ?? undefined,
      statusCode: record.statusCode ?? undefined,
      headers: rawHeaders,
      payload: record.payload ?? undefined,
      body: record.body ?? undefined,
      content: record.content ?? undefined,
      context: record.context ?? undefined,
      notes: record.notes ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

export const prismaEvidenceRepository = new PrismaEvidenceRepository();
