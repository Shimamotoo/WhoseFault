import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Occurrence } from '../../domain/occurrence.js';
import { Evidence } from '../../domain/evidence.js';
import { occurrenceRepository } from '../../infra/repositories/occurrenceRepository.js';
import { evidenceRepository } from '../../infra/repositories/evidenceRepository.js';
import { createEvidence } from '../../application/createEvidence.js';
import { listEvidences } from '../../application/listEvidences.js';
import { updateEvidence } from '../../application/updateEvidence.js';
import {
  deleteEvidence,
  DeleteConfirmationRequiredError,
} from '../../application/deleteEvidence.js';
import {
  prepareEvidencesForAI,
  type IAIEvidenceConsumer,
} from '../../application/prepareEvidencesForAI.js';
import {
  SECRET_ALERT_MESSAGE,
  SECRET_SECURITY_GUIDANCE,
  SensitiveDataDetectedError,
  type ISecretDetector,
} from '../../domain/services/ISecretDetector.js';
import { PatternSecretDetector } from '../../domain/services/secretDetector.js';

describe('SPEC-03: Casos de Uso de Gerenciamento de Evidências (Aplicação)', () => {
  let baseOccurrenceId: string;

  beforeEach(async () => {
    occurrenceRepository.clear();
    evidenceRepository.clear();

    const occ = Occurrence.create({
      apiName: 'API Pedidos',
      url: 'https://api.exemplo.com/v1/pedidos',
      method: 'POST',
      description: 'Falha intermitente ao criar pedido',
    });
    await occurrenceRepository.save(occ);
    baseOccurrenceId = occ.id;
  });

  it('CA-07: deve manter várias evidências independentes na mesma ocorrência, inclusive do mesmo tipo, sem sobrescrever as anteriores', async () => {
    // Arrange & Act
    const firstReq = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.exemplo.com/v1/pedidos',
        payload: '{"tentativa":1}',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    const secondReq = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.exemplo.com/v1/pedidos',
        payload: '{"tentativa":2}',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    const responseEv = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_RESPONSE',
        statusCode: 502,
        body: 'Bad Gateway',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Assert
    const allEvidences = await listEvidences(
      baseOccurrenceId,
      occurrenceRepository,
      evidenceRepository,
    );
    expect(allEvidences).toHaveLength(3);
    expect(allEvidences.map((e) => e.id)).toEqual([
      firstReq.id,
      secondReq.id,
      responseEv.id,
    ]);
  });

  it('CA-08: deve consultar as evidências de uma ocorrência apresentando o tipo e conteúdo correspondente de cada uma', async () => {
    // Arrange
    await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'ERROR_LOG',
        content: 'Timeout after 5000ms',
        context: 'Worker #2',
      },
      occurrenceRepository,
      evidenceRepository,
    );
    await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Ocorre apenas em horário de pico.',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Act
    const list = await listEvidences(
      baseOccurrenceId,
      occurrenceRepository,
      evidenceRepository,
    );

    // Assert
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      type: 'ERROR_LOG',
      content: 'Timeout after 5000ms',
      context: 'Worker #2',
    });
    expect(list[1]).toMatchObject({
      type: 'MANUAL_NOTE',
      content: 'Ocorre apenas em horário de pico.',
    });
  });

  it('CA-09: deve editar uma evidência existente preservando os dados não modificados e mantendo as demais evidências intactas', async () => {
    // Arrange
    const ev1 = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.exemplo.com/v1/pedidos',
        headers: { 'Content-Type': 'application/json' },
        payload: '{"item":"A"}',
        notes: 'Nota inicial',
      },
      occurrenceRepository,
      evidenceRepository,
    );
    const ev2 = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Outra evidência independente',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Act
    const updatedEv1 = await updateEvidence(
      {
        occurrenceId: baseOccurrenceId,
        evidenceId: ev1.id,
        payload: '{"item":"B"}',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Assert
    expect(updatedEv1.payload).toBe('{"item":"B"}');
    expect(updatedEv1.url).toBe('https://api.exemplo.com/v1/pedidos');
    expect(updatedEv1.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(updatedEv1.notes).toBe('Nota inicial');

    const storedEv2 = await evidenceRepository.findById(ev2.id);
    expect(storedEv2?.content).toBe('Outra evidência independente');
  });

  it('CA-10 e CA-11: deve exigir confirmação explícita para exclusão e manter a evidência intacta quando não confirmada (cancelada)', async () => {
    // Arrange
    const created = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Evidência importante',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Act & Assert
    await expect(
      deleteEvidence(
        {
          occurrenceId: baseOccurrenceId,
          evidenceId: created.id,
          confirmed: false,
        },
        occurrenceRepository,
        evidenceRepository,
      ),
    ).rejects.toThrow(DeleteConfirmationRequiredError);

    const remaining = await listEvidences(
      baseOccurrenceId,
      occurrenceRepository,
      evidenceRepository,
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(created.id);
  });

  it('CA-12: deve excluir definitivamente a evidência selecionada após confirmação, preservando a ocorrência e as demais evidências', async () => {
    // Arrange
    const evToDelete = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'ERROR_LOG',
        content: 'Log que será removido',
      },
      occurrenceRepository,
      evidenceRepository,
    );
    const evToKeep = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'MANUAL_NOTE',
        content: 'Evidência que permanece',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Act
    await deleteEvidence(
      {
        occurrenceId: baseOccurrenceId,
        evidenceId: evToDelete.id,
        confirmed: true,
      },
      occurrenceRepository,
      evidenceRepository,
    );

    // Assert
    const remaining = await listEvidences(
      baseOccurrenceId,
      occurrenceRepository,
      evidenceRepository,
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(evToKeep.id);

    const occurrenceStillExists = await occurrenceRepository.findById(baseOccurrenceId);
    expect(occurrenceStillExists).not.toBeNull();
  });

  it('CA-15: deve impedir o envio desprotegido de evidências à IA quando o detector identificar um segredo (usando Mock/Stub por Inversão de Dependência)', async () => {
    // Arrange
    const noopDetectorOnCreate: ISecretDetector = {
      inspect: () => ({
        hasSecrets: false,
        detectedFields: [],
        alertMessage: SECRET_ALERT_MESSAGE,
        securityGuidance: SECRET_SECURITY_GUIDANCE,
      }),
      assertNoSecrets: () => {},
    };

    const unsafeEvidence = Evidence.create(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_REQUEST',
        method: 'GET',
        url: 'https://api.exemplo.com/v1/secret',
        headers: { Authorization: 'Bearer sk-live-secret1234567890abcdef' },
      },
      noopDetectorOnCreate,
    );

    const aiConsumerMock: IAIEvidenceConsumer<string> = {
      processEvidences: vi.fn().mockResolvedValue('Diagnóstico gerado'),
    };
    const strictDetector = new PatternSecretDetector();

    // Act & Assert
    await expect(
      prepareEvidencesForAI([unsafeEvidence], strictDetector, aiConsumerMock),
    ).rejects.toThrow(SensitiveDataDetectedError);
    expect(aiConsumerMock.processEvidences).not.toHaveBeenCalled();
  });

  it('CA-15: deve encaminhar as evidências ao consumidor de IA somente quando nenhum segredo for detectado', async () => {
    // Arrange
    const safeEvidence = Evidence.create({
      occurrenceId: baseOccurrenceId,
      type: 'HTTP_RESPONSE',
      statusCode: 500,
      body: '{"error":"Internal Server Error"}',
    });

    const aiConsumerStub: IAIEvidenceConsumer<string> = {
      processEvidences: vi.fn().mockResolvedValue('Análise concluída com segurança'),
    };
    const strictDetector = new PatternSecretDetector();

    // Act
    const result = await prepareEvidencesForAI([safeEvidence], strictDetector, aiConsumerStub);

    // Assert
    expect(result).toBe('Análise concluída com segurança');
    expect(aiConsumerStub.processEvidences).toHaveBeenCalledTimes(1);
  });

  it('CA-16: deve permitir registrar, consultar, editar e remover evidências normalmente sem depender da disponibilidade da IA', async () => {
    // Arrange & Act
    const created = await createEvidence(
      {
        occurrenceId: baseOccurrenceId,
        type: 'HTTP_RESPONSE',
        statusCode: 429,
        body: 'Too Many Requests',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    const listed = await listEvidences(
      baseOccurrenceId,
      occurrenceRepository,
      evidenceRepository,
    );

    const updated = await updateEvidence(
      {
        occurrenceId: baseOccurrenceId,
        evidenceId: created.id,
        notes: 'Rate limit atingido após 100 chamadas/min',
      },
      occurrenceRepository,
      evidenceRepository,
    );

    await deleteEvidence(
      {
        occurrenceId: baseOccurrenceId,
        evidenceId: created.id,
        confirmed: true,
      },
      occurrenceRepository,
      evidenceRepository,
    );

    const listedAfterDelete = await listEvidences(
      baseOccurrenceId,
      occurrenceRepository,
      evidenceRepository,
    );

    // Assert
    expect(listed).toHaveLength(1);
    expect(updated.notes).toBe('Rate limit atingido após 100 chamadas/min');
    expect(listedAfterDelete).toHaveLength(0);
  });
});
