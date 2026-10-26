import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaOccurrenceRepository } from '../../infra/repositories/prismaOccurrenceRepository.js';
import { PrismaDiagnosisRepository } from '../../infra/repositories/prismaDiagnosisRepository.js';
import { Occurrence, type HttpMethod } from '../../domain/occurrence.js';
import type { DiagnosisContext, DiagnosisResult } from '../../domain/diagnosis.js';

describe('Integração: PrismaDiagnosisRepository e Relacionamento 1:1 (PostgreSQL)', () => {
  let testPrisma: PrismaClient;
  let occurrenceRepo: PrismaOccurrenceRepository;
  let diagnosisRepo: PrismaDiagnosisRepository;
  let baseOccurrence: Occurrence;

  beforeAll(async () => {
    testPrisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_TEST ??
            'postgresql://postgres:postgres@localhost:5432/whosefault_test?schema=public',
        },
      },
    });
    await testPrisma.$connect();
    occurrenceRepo = new PrismaOccurrenceRepository(testPrisma);
    diagnosisRepo = new PrismaDiagnosisRepository(testPrisma);
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await testPrisma.$executeRawUnsafe('TRUNCATE TABLE occurrences, evidences, diagnoses CASCADE;');

    baseOccurrence = Occurrence.create({
      apiName: 'API Pagamentos',
      url: 'https://api.pagamentos.com/v1/charge',
      method: 'POST' as HttpMethod,
      description: 'Falha ao autorizar transação',
    });
    await occurrenceRepo.save(baseOccurrence);
  });

  it('deve realizar UPSERT mantendo relação 1:1 por occurrenceId e atualizar isOutdated via markAsOutdated', async () => {
    const context: DiagnosisContext = {
      occurrence: {
        id: baseOccurrence.id,
        apiName: baseOccurrence.apiName,
        url: baseOccurrence.url,
        method: baseOccurrence.method,
        description: baseOccurrence.description,
      },
      evidences: [],
    };

    const firstResult: DiagnosisResult = {
      facts_observed: ['Fato 1'],
      hypotheses: [{ cause: 'Causa 1', evidence_support: 'Suporte 1' }],
      missing_information: ['Info 1'],
    };

    const created = await diagnosisRepo.upsert({
      occurrenceId: baseOccurrence.id,
      context,
      result: firstResult,
      isOutdated: false,
    });

    expect(created.occurrenceId).toBe(baseOccurrence.id);
    expect(created.isOutdated).toBe(false);
    expect(created.result).toEqual(firstResult);

    // Marca como desatualizado
    await diagnosisRepo.markAsOutdated(baseOccurrence.id);
    const outdated = await diagnosisRepo.findByOccurrenceId(baseOccurrence.id);
    expect(outdated?.isOutdated).toBe(true);

    // Novo UPSERT substitui o diagnóstico mantendo relação 1:1 e reseta isOutdated para false
    const secondResult: DiagnosisResult = {
      facts_observed: ['Fato 2 atualizado'],
      hypotheses: [{ cause: 'Causa 2', evidence_support: 'Suporte 2' }],
      missing_information: [],
    };

    const updated = await diagnosisRepo.upsert({
      occurrenceId: baseOccurrence.id,
      context,
      result: secondResult,
      isOutdated: false,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.isOutdated).toBe(false);
    expect(updated.result).toEqual(secondResult);
  });

  it('ADR-002 / RN-01: deve remover o diagnóstico em CASCADE ao deletar a ocorrência pai', async () => {
    await diagnosisRepo.upsert({
      occurrenceId: baseOccurrence.id,
      context: {
        occurrence: {
          id: baseOccurrence.id,
          apiName: baseOccurrence.apiName,
          url: baseOccurrence.url,
          method: baseOccurrence.method,
        },
        evidences: [],
      },
      result: {
        facts_observed: [],
        hypotheses: [],
        missing_information: [],
      },
      isOutdated: false,
    });

    await testPrisma.occurrence.delete({
      where: { id: baseOccurrence.id },
    });

    const found = await diagnosisRepo.findByOccurrenceId(baseOccurrence.id);
    expect(found).toBeNull();
  });
});
