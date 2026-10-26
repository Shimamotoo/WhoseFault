import { Prisma, type PrismaClient } from '@prisma/client';
import {
  Diagnosis,
  type DiagnosisContext,
  type DiagnosisResult,
} from '../../domain/diagnosis.js';
import type {
  IDiagnosisRepository,
  UpsertDiagnosisInput,
} from '../../domain/repositories/IDiagnosisRepository.js';
import { prisma as defaultPrisma } from '../prisma/client.js';

export class PrismaDiagnosisRepository implements IDiagnosisRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async findByOccurrenceId(occurrenceId: string): Promise<Diagnosis | null> {
    const record = await this.db.diagnosis.findUnique({
      where: { occurrenceId },
    });

    if (!record) {
      return null;
    }

    return this.mapRecordToDomain(record);
  }

  async upsert(input: UpsertDiagnosisInput): Promise<Diagnosis> {
    const isOutdated = input.isOutdated ?? false;
    const contextJson = input.context as unknown as Prisma.InputJsonValue;
    const resultJson = input.result as unknown as Prisma.InputJsonValue;

    const record = await this.db.diagnosis.upsert({
      where: { occurrenceId: input.occurrenceId },
      create: {
        occurrenceId: input.occurrenceId,
        context: contextJson,
        result: resultJson,
        isOutdated,
      },
      update: {
        context: contextJson,
        result: resultJson,
        isOutdated,
      },
    });

    return this.mapRecordToDomain(record);
  }

  async markAsOutdated(occurrenceId: string): Promise<void> {
    await this.db.diagnosis.updateMany({
      where: { occurrenceId },
      data: { isOutdated: true },
    });
  }

  private mapRecordToDomain(record: {
    id: string;
    occurrenceId: string;
    context: unknown;
    result: unknown;
    isOutdated: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Diagnosis {
    return Diagnosis.create({
      id: record.id,
      occurrenceId: record.occurrenceId,
      context: record.context as DiagnosisContext,
      result: record.result as DiagnosisResult,
      isOutdated: record.isOutdated,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

export const prismaDiagnosisRepository = new PrismaDiagnosisRepository();
