/**
 * Testes unitários para o caso de uso GenerateDiagnosisUseCase e gerenciamento do estado isOutdated.
 *
 * Referências de Especificação e Arquitetura:
 * - SPEC-04 (RF-01 a RF-09, RN-01 a RN-04, CA-01 a CA-06)
 * - ADR-003 (Isolamento do provedor e consistência em chamadas concorrentes)
 * - ADR-004 (Double-check de segredos antes de envio externo)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Occurrence } from '../../domain/occurrence.js';
import { Evidence } from '../../domain/evidence.js';
import type { DiagnosisResult } from '../../domain/diagnosis.js';
import { occurrenceRepository } from '../../infra/repositories/occurrenceRepository.js';
import { evidenceRepository } from '../../infra/repositories/evidenceRepository.js';
import { diagnosisRepository } from '../../infra/repositories/diagnosisRepository.js';
import { PrismaDiagnosisRepository } from '../../infra/repositories/prismaDiagnosisRepository.js';
import type { PrismaClient } from '@prisma/client';
import {
  GenerateDiagnosisUseCase,
  SecurityError,
} from '../../application/useCases/generateDiagnosisUseCase.js';
import { createEvidence } from '../../application/createEvidence.js';
import { updateEvidence } from '../../application/updateEvidence.js';
import { deleteEvidence } from '../../application/deleteEvidence.js';
import { updateOccurrence } from '../../application/updateOccurrence.js';
import { retryTitleGeneration } from '../../application/retryTitleGeneration.js';
import {
  DiagnosisSchemaMismatchError,
  type IDiagnosisGenerator,
} from '../../domain/services/IDiagnosisGenerator.js';
import type { ISecretDetector } from '../../domain/services/ISecretDetector.js';
import { PatternSecretDetector } from '../../domain/services/secretDetector.js';
import { StubTitleGenerator } from '../../infra/ai/stubTitleGenerator.js';

describe('SPEC-04: GenerateDiagnosisUseCase e Gerenciamento de isOutdated', () => {
  let baseOccurrenceId: string;
  let validAIResult: DiagnosisResult;
  let mockDiagnosisGenerator: IDiagnosisGenerator;

  beforeEach(async () => {
    occurrenceRepository.clear();
    evidenceRepository.clear();
    diagnosisRepository.clear();

    const occ = Occurrence.create({
      apiName: 'API Checkout',
      url: 'https://api.checkout.com/v1/orders',
      method: 'POST',
      description: 'Erro 500 ao finalizar pedido com múltiplos itens.',
    });
    await occurrenceRepository.save(occ);
    baseOccurrenceId = occ.id;

    validAIResult = {
      facts_observed: [
        'Requisição POST enviada para /v1/orders.',
        'Resposta HTTP 500 recebida com erro de banco.',
      ],
      hypotheses: [
        {
          cause: 'Violação de constraint ou deadlock ao inserir itens do pedido.',
          evidence_support: 'Log de erro aponta falha na transação SQL.',
        },
      ],
      missing_information: ['Stack trace completo do banco de dados e payload exato dos itens.'],
    };

    mockDiagnosisGenerator = {
      generate: vi.fn().mockResolvedValue(validAIResult),
    };
  });

  it('CA-01: deve gerar diagnóstico com sucesso, salvar via UPSERT mantendo relação 1:1, armazenar snapshot em context e definir isOutdated = false', async () => {
    // Arrange
    const ev = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_RESPONSE',
        statusCode: 500,
        body: '{"error":"Database transaction failed"}',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: mockDiagnosisGenerator,
    });

    // Act
    const output = await useCase.execute(baseOccurrenceId);

    // Assert
    expect(output.discardedByConcurrency).toBe(false);
    expect(output.diagnosis).not.toBeNull();
    expect(output.diagnosis?.occurrenceId).toBe(baseOccurrenceId);
    expect(output.diagnosis?.isOutdated).toBe(false);
    expect(output.diagnosis?.result).toEqual(validAIResult);
    expect(output.diagnosis?.context.occurrence.id).toBe(baseOccurrenceId);
    expect(output.diagnosis?.context.evidences).toHaveLength(1);
    expect(output.diagnosis?.context.evidences[0]?.id).toBe(ev.id);

    // Verifica que um segundo disparo faz UPSERT mantendo o mesmo ID de diagnóstico (relação 1:1)
    const updatedResult: DiagnosisResult = {
      ...validAIResult,
      facts_observed: ['Fato atualizado na segunda análise'],
    };
    vi.mocked(mockDiagnosisGenerator.generate).mockResolvedValueOnce(updatedResult);

    const secondOutput = await useCase.execute(baseOccurrenceId);
    expect(secondOutput.diagnosis?.id).toBe(output.diagnosis?.id);
    expect(secondOutput.diagnosis?.result.facts_observed).toEqual([
      'Fato atualizado na segunda análise',
    ]);
  });

  it('CA-02: deve bloquear a chamada à IA e lançar SecurityError quando o double-check detectar credenciais nas evidências compiladas', async () => {
    // Arrange: Cria evidência bypassando o detector na entrada para simular dado suspeito pré-existente
    const noopDetector: ISecretDetector = {
      inspect: () => ({
        hasSecrets: false,
        detectedFields: [],
        alertMessage: '',
        securityGuidance: '',
      }),
      assertNoSecrets: () => {},
    };

    const unsafeEvidence = Evidence.create(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.checkout.com/v1/orders',
        headers: {
          Authorization: 'Bearer sk-live-secret1234567890abcdef1234',
        },
      },
      noopDetector,
    );
    await evidenceRepository.save(unsafeEvidence);

    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: mockDiagnosisGenerator,
      secretDetector: new PatternSecretDetector(),
    });

    // Act & Assert
    await expect(useCase.execute(baseOccurrenceId)).rejects.toThrow(SecurityError);
    expect(mockDiagnosisGenerator.generate).not.toHaveBeenCalled();

    const saved = await diagnosisRepository.findByOccurrenceId(baseOccurrenceId);
    expect(saved).toBeNull();
  });

  it('CA-03: deve preservar o diagnóstico anterior intacto quando a resposta da IA falhar na validação do Zod (Schema Mismatch)', async () => {
    // Arrange: Gera primeiro diagnóstico válido
    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: mockDiagnosisGenerator,
    });
    const firstRun = await useCase.execute(baseOccurrenceId);
    expect(firstRun.diagnosis).not.toBeNull();

    // Simula falha estrutural (Schema Mismatch) na segunda tentativa
    vi.mocked(mockDiagnosisGenerator.generate).mockRejectedValueOnce(
      new DiagnosisSchemaMismatchError(),
    );

    // Act & Assert
    await expect(useCase.execute(baseOccurrenceId)).rejects.toThrow(DiagnosisSchemaMismatchError);

    // Garante que o diagnóstico anterior foi preservado
    const preserved = await diagnosisRepository.findByOccurrenceId(baseOccurrenceId);
    expect(preserved).not.toBeNull();
    expect(preserved?.id).toBe(firstRun.diagnosis?.id);
    expect(preserved?.result).toEqual(validAIResult);
  });

  it('CA-04: deve descartar silenciosamente o payload retornado pela IA se uma evidência for adicionada, editada ou excluída durante o processamento', async () => {
    // Arrange
    const ev = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Nota original antes da chamada à IA',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Durante a execução do generate(), uma evidência é alterada em paralelo no banco
    const concurrentGenerator: IDiagnosisGenerator = {
      generate: vi.fn().mockImplementation(async () => {
        await updateEvidence(
          {
            occurrenceId: baseOccurrenceId,
            evidenceId: ev.id,
            content: 'Nota modificada concorrentemente enquanto a IA processava',
          },
          occurrenceRepository,
          evidenceRepository,
        );
        return validAIResult;
      }),
    };

    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: concurrentGenerator,
    });

    // Act
    const output = await useCase.execute(baseOccurrenceId);

    // Assert: Descarta silenciosamente e não salva no banco
    expect(output.discardedByConcurrency).toBe(true);
    expect(output.diagnosis).toBeNull();

    const storedDiagnosis = await diagnosisRepository.findByOccurrenceId(baseOccurrenceId);
    expect(storedDiagnosis).toBeNull();
  });

  it('CA-04: deve descartar silenciosamente o payload se uma evidência for excluída durante o processamento da IA', async () => {
    // Arrange
    const ev = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'ERROR_LOG',
        content: 'Log que será deletado durante a chamada à IA',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    const concurrentDeleteGenerator: IDiagnosisGenerator = {
      generate: vi.fn().mockImplementation(async () => {
        await deleteEvidence(
          {
            occurrenceId: baseOccurrenceId,
            evidenceId: ev.id,
            confirmed: true,
          },
          occurrenceRepository,
          evidenceRepository,
        );
        return validAIResult;
      }),
    };

    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: concurrentDeleteGenerator,
    });

    // Act
    const output = await useCase.execute(baseOccurrenceId);

    // Assert
    expect(output.discardedByConcurrency).toBe(true);
    expect(output.diagnosis).toBeNull();
    expect(await diagnosisRepository.findByOccurrenceId(baseOccurrenceId)).toBeNull();
  });

  it('CA-05: deve marcar o diagnóstico existente como desatualizado (isOutdated = true) ao criar, editar ou excluir evidência ou editar ocorrência (exceto título)', async () => {
    // Arrange: Cria diagnóstico inicial atualizado (isOutdated = false)
    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: mockDiagnosisGenerator,
    });

    await useCase.execute(baseOccurrenceId);
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(
      false,
    );

    // 1. Criar evidência -> deve marcar isOutdated = true
    const createdEv = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Nova evidência adicionada',
      },
      occurrenceRepository,
      evidenceRepository,
      undefined,
      diagnosisRepository,
    );
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(true);

    // Regera diagnóstico -> volta para isOutdated = false
    await useCase.execute(baseOccurrenceId);
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(
      false,
    );

    // 2. Editar evidência -> deve marcar isOutdated = true
    await updateEvidence(
      {
        occurrenceId: baseOccurrenceId,
        evidenceId: createdEv.id,
        content: 'Evidência editada',
      },
      occurrenceRepository,
      evidenceRepository,
      undefined,
      diagnosisRepository,
    );
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(true);

    // Regera diagnóstico -> volta para isOutdated = false
    await useCase.execute(baseOccurrenceId);
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(
      false,
    );

    // 3. Excluir evidência -> deve marcar isOutdated = true
    await deleteEvidence(
      {
        occurrenceId: baseOccurrenceId,
        evidenceId: createdEv.id,
        confirmed: true,
      },
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
    );
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(true);

    // Regera diagnóstico -> volta para isOutdated = false
    await useCase.execute(baseOccurrenceId);
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(
      false,
    );

    // 4. Editar ocorrência (UpdateOccurrence) -> deve marcar isOutdated = true
    await updateOccurrence(
      {
        id: baseOccurrenceId,
        description: 'Descrição atualizada da ocorrência',
      },
      occurrenceRepository,
      new StubTitleGenerator(),
      diagnosisRepository,
    );
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(true);

    // Regera diagnóstico -> volta para isOutdated = false
    await useCase.execute(baseOccurrenceId);
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(
      false,
    );

    // 5. Alterar exclusivamente o título via retryTitleGeneration (OC-06) -> NÃO deve invalidar o diagnóstico
    await retryTitleGeneration(baseOccurrenceId, occurrenceRepository, new StubTitleGenerator());
    expect((await diagnosisRepository.findByOccurrenceId(baseOccurrenceId))?.isOutdated).toBe(
      false,
    );
  });

  it('RN-01 / RN-02: PrismaDiagnosisRepository deve invocar prisma.diagnosis.upsert e prisma.diagnosis.updateMany({ where: { occurrenceId }, data: { isOutdated: true } })', async () => {
    const now = new Date();
    const mockPrisma = {
      diagnosis: {
        upsert: vi.fn().mockResolvedValue({
          id: 'diag-uuid-1',
          occurrenceId: baseOccurrenceId,
          context: {
            occurrence: {
              id: baseOccurrenceId,
              apiName: 'API Checkout',
              url: 'https://api.checkout.com/v1/orders',
              method: 'POST',
            },
            evidences: [],
          },
          result: validAIResult,
          isOutdated: false,
          createdAt: now,
          updatedAt: now,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const prismaDiagnosisRepo = new PrismaDiagnosisRepository(mockPrisma);

    const useCase = new GenerateDiagnosisUseCase({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository: prismaDiagnosisRepo,
      diagnosisGenerator: mockDiagnosisGenerator,
    });

    await useCase.execute(baseOccurrenceId);

    expect(mockPrisma.diagnosis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { occurrenceId: baseOccurrenceId },
        create: expect.objectContaining({
          occurrenceId: baseOccurrenceId,
          isOutdated: false,
          result: validAIResult,
        }),
        update: expect.objectContaining({
          isOutdated: false,
          result: validAIResult,
        }),
      }),
    );

    await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Evidência que dispara updateMany no banco',
      },
      occurrenceRepository,
      evidenceRepository,
      undefined,
      prismaDiagnosisRepo,
    );

    expect(mockPrisma.diagnosis.updateMany).toHaveBeenCalledWith({
      where: { occurrenceId: baseOccurrenceId },
      data: { isOutdated: true },
    });
  });
});
