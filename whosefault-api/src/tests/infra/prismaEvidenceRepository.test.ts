import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaOccurrenceRepository } from '../../infra/repositories/prismaOccurrenceRepository.js';
import { PrismaEvidenceRepository } from '../../infra/repositories/prismaEvidenceRepository.js';
import { Occurrence, type HttpMethod } from '../../domain/occurrence.js';
import { Evidence, type EvidenceType } from '../../domain/evidence.js';

describe('Integração: PrismaEvidenceRepository e Integridade Relacional (PostgreSQL)', () => {
  let testPrisma: PrismaClient;
  let occurrenceRepo: PrismaOccurrenceRepository;
  let evidenceRepo: PrismaEvidenceRepository;
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
    evidenceRepo = new PrismaEvidenceRepository(testPrisma);
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await testPrisma.$executeRawUnsafe('TRUNCATE TABLE occurrences, evidences CASCADE;');

    baseOccurrence = Occurrence.create({
      apiName: 'API Central',
      url: 'https://central.api.com/v1',
      method: 'POST' as HttpMethod,
    });
    await occurrenceRepo.save(baseOccurrence);
  });

  it('deve persistir e consultar evidências de todos os 4 tipos permitidos', async () => {
    // Arrange
    const reqEvidence = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'POST',
      url: 'https://central.api.com/v1/orders',
      headers: { 'Content-Type': 'application/json' },
      payload: '{"orderId":123}',
      notes: 'Nota da requisição',
    });

    const resEvidence = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'HTTP_RESPONSE' as EvidenceType,
      statusCode: 504,
      headers: { 'X-Error': 'Gateway Timeout' },
      body: 'Gateway timed out',
    });

    const logEvidence = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'ERROR_LOG' as EvidenceType,
      content: 'Error: Connection reset by peer',
      context: 'Worker node 3',
    });

    const noteEvidence = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'MANUAL_NOTE' as EvidenceType,
      content: 'Observação técnica manual sobre o incidente.',
    });

    // Act
    await evidenceRepo.save(reqEvidence);
    await evidenceRepo.save(resEvidence);
    await evidenceRepo.save(logEvidence);
    await evidenceRepo.save(noteEvidence);

    const list = await evidenceRepo.findByOccurrenceId(baseOccurrence.id);

    // Assert
    expect(list).toHaveLength(4);

    const reqFound = list.find((e) => e.type === 'HTTP_REQUEST');
    expect(reqFound?.method).toBe('POST');
    expect(reqFound?.url).toBe('https://central.api.com/v1/orders');
    expect(reqFound?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(reqFound?.payload).toBe('{"orderId":123}');
    expect(reqFound?.notes).toBe('Nota da requisição');

    const resFound = list.find((e) => e.type === 'HTTP_RESPONSE');
    expect(resFound?.statusCode).toBe(504);
    expect(resFound?.headers).toEqual({ 'X-Error': 'Gateway Timeout' });

    const logFound = list.find((e) => e.type === 'ERROR_LOG');
    expect(logFound?.content).toBe('Error: Connection reset by peer');
    expect(logFound?.context).toBe('Worker node 3');

    const noteFound = list.find((e) => e.type === 'MANUAL_NOTE');
    expect(noteFound?.content).toBe('Observação técnica manual sobre o incidente.');
  });

  it('deve atualizar dados de uma evidência existente', async () => {
    // Arrange
    const original = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'MANUAL_NOTE' as EvidenceType,
      content: 'Texto original',
    });
    await evidenceRepo.save(original);

    const updated = Evidence.create({
      id: original.id,
      occurrenceId: original.occurrenceId,
      type: original.type,
      content: 'Texto atualizado',
      createdAt: original.createdAt,
      updatedAt: new Date(),
    });

    // Act
    await evidenceRepo.update(updated);
    const reloaded = await evidenceRepo.findById(original.id);

    // Assert
    expect(reloaded?.content).toBe('Texto atualizado');
  });

  it('deve excluir uma evidência individual preservando a ocorrência e demais evidências', async () => {
    // Arrange
    const ev1 = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'MANUAL_NOTE',
      content: 'Evidência que será removida',
    });
    const ev2 = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'MANUAL_NOTE',
      content: 'Evidência que deve permanecer',
    });

    await evidenceRepo.save(ev1);
    await evidenceRepo.save(ev2);

    // Act
    await evidenceRepo.delete(ev1.id);

    // Assert
    const deleted = await evidenceRepo.findById(ev1.id);
    expect(deleted).toBeNull();

    const remaining = await evidenceRepo.findByOccurrenceId(baseOccurrence.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(ev2.id);

    const occStillExists = await occurrenceRepo.findById(baseOccurrence.id);
    expect(occStillExists).not.toBeNull();
  });

  it('ADR-002: deve remover todas as evidências em CASCADE ao deletar a ocorrência pai diretamente no banco', async () => {
    // Arrange
    const ev1 = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'ERROR_LOG',
      content: 'Log associado',
    });
    const ev2 = Evidence.create({
      occurrenceId: baseOccurrence.id,
      type: 'HTTP_RESPONSE',
      statusCode: 500,
    });

    await evidenceRepo.save(ev1);
    await evidenceRepo.save(ev2);

    // Act - Deleta a ocorrência diretamente no banco via Prisma
    await testPrisma.occurrence.delete({
      where: { id: baseOccurrence.id },
    });

    // Assert - Verifica que as evidências foram removidas automaticamente pelo banco (onDelete: Cascade)
    const evidencesInDb = await testPrisma.evidence.findMany({
      where: { occurrenceId: baseOccurrence.id },
    });
    expect(evidencesInDb).toHaveLength(0);
  });
});
