import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaOccurrenceRepository } from '../../infra/repositories/prismaOccurrenceRepository.js';
import { Occurrence, type HttpMethod } from '../../domain/occurrence.js';

describe('Integração: PrismaOccurrenceRepository (PostgreSQL)', () => {
  let testPrisma: PrismaClient;
  let repo: PrismaOccurrenceRepository;

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
    repo = new PrismaOccurrenceRepository(testPrisma);
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await testPrisma.$executeRawUnsafe('TRUNCATE TABLE occurrences, evidences CASCADE;');
  });

  it('deve persistir uma ocorrência e recuperá-la por ID', async () => {
    // Arrange
    const occurrence = Occurrence.create({
      apiName: 'API Pagamentos',
      url: 'https://api.pagamentos.com/v1/charge',
      method: 'POST' as HttpMethod,
      description: 'Erro 500 no processamento de cartão',
      title: 'Falha ao processar pagamento',
    });

    // Act
    await repo.save(occurrence);
    const found = await repo.findById(occurrence.id);

    // Assert
    expect(found).not.toBeNull();
    expect(found?.id).toBe(occurrence.id);
    expect(found?.apiName).toBe('API Pagamentos');
    expect(found?.url).toBe('https://api.pagamentos.com/v1/charge');
    expect(found?.method).toBe('POST');
    expect(found?.description).toBe('Erro 500 no processamento de cartão');
    expect(found?.title).toBe('Falha ao processar pagamento');
  });

  it('deve listar todas as ocorrências ordenadas da mais recente para a mais antiga', async () => {
    // Arrange
    const first = Occurrence.create({
      apiName: 'API 1',
      url: 'https://api1.com/test',
      method: 'GET' as HttpMethod,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    });
    const second = Occurrence.create({
      apiName: 'API 2',
      url: 'https://api2.com/test',
      method: 'POST' as HttpMethod,
      createdAt: new Date('2026-01-02T10:00:00Z'),
    });

    await repo.save(first);
    await repo.save(second);

    // Act
    const list = await repo.findAll();

    // Assert
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(second.id);
    expect(list[1]?.id).toBe(first.id);
  });

  it('deve atualizar dados de uma ocorrência existente', async () => {
    // Arrange
    const occurrence = Occurrence.create({
      apiName: 'API Original',
      url: 'https://api.com/v1',
      method: 'GET' as HttpMethod,
      title: 'Título Original',
    });
    await repo.save(occurrence);

    const updated = Occurrence.create({
      id: occurrence.id,
      apiName: 'API Atualizada',
      url: 'https://api.com/v2',
      method: 'PUT' as HttpMethod,
      title: 'Título Atualizado',
      description: 'Nova descrição adicionada',
      createdAt: occurrence.createdAt,
      updatedAt: new Date(),
    });

    // Act
    await repo.update(updated);
    const reloaded = await repo.findById(occurrence.id);

    // Assert
    expect(reloaded?.apiName).toBe('API Atualizada');
    expect(reloaded?.url).toBe('https://api.com/v2');
    expect(reloaded?.method).toBe('PUT');
    expect(reloaded?.title).toBe('Título Atualizado');
    expect(reloaded?.description).toBe('Nova descrição adicionada');
  });
});
