/**
 * Testes dos endpoints HTTP de Diagnóstico (/api/occurrences/:id/diagnosis).
 *
 * Referências de Especificação:
 * - SPEC-04 (RF-01 a RF-09, RN-01 a RN-04, CA-01 a CA-06)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../../http/server.js';
import { occurrenceRepository } from '../../infra/repositories/occurrenceRepository.js';
import { evidenceRepository } from '../../infra/repositories/evidenceRepository.js';
import { diagnosisRepository } from '../../infra/repositories/diagnosisRepository.js';
import { Occurrence } from '../../domain/occurrence.js';
import { Evidence } from '../../domain/evidence.js';
import {
  DiagnosisSchemaMismatchError,
  DiagnosisTimeoutError,
  type IDiagnosisGenerator,
} from '../../domain/services/IDiagnosisGenerator.js';
import { SECRET_ALERT_MESSAGE, type ISecretDetector } from '../../domain/services/ISecretDetector.js';

describe('SPEC-04: Endpoints HTTP de Diagnóstico (/api/occurrences/:id/diagnosis)', () => {
  let occurrenceId: string;
  let mockDiagnosisGenerator: IDiagnosisGenerator;

  beforeEach(async () => {
    occurrenceRepository.clear();
    evidenceRepository.clear();
    diagnosisRepository.clear();

    const occ = Occurrence.create({
      apiName: 'API Autenticação',
      url: 'https://api.auth.com/v1/token',
      method: 'POST',
      description: 'Falha 500 ao validar sessão.',
    });
    await occurrenceRepository.save(occ);
    occurrenceId = occ.id;

    mockDiagnosisGenerator = {
      generate: vi.fn().mockResolvedValue({
        facts_observed: ['Status 500 retornado pelo endpoint /v1/token.'],
        hypotheses: [
          {
            cause: 'Indisponibilidade do cluster Redis de sessão.',
            evidence_support: 'Log de erro aponta Connection refused na porta 6379.',
          },
        ],
        missing_information: ['Configuração de timeout do cliente Redis.'],
      }),
    };
  });

  const createTestServer = (generator: IDiagnosisGenerator = mockDiagnosisGenerator) =>
    createServer({
      occurrenceRepository,
      evidenceRepository,
      diagnosisRepository,
      diagnosisGenerator: generator,
    });

  it('CA-01 e RF-08: deve gerar o diagnóstico via POST /api/occurrences/:id/diagnosis e consultá-lo via GET /api/occurrences/:id/diagnosis', async () => {
    // Arrange
    const app = createTestServer();
    await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'ERROR_LOG',
        content: 'RedisError: Connection refused 127.0.0.1:6379',
      },
    });

    // Act — Solicita geração do diagnóstico
    const postRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Assert POST
    expect(postRes.statusCode).toBe(200);
    const postBody = postRes.json();
    expect(postBody.occurrenceId).toBe(occurrenceId);
    expect(postBody.isOutdated).toBe(false);
    expect(postBody.result.facts_observed).toEqual([
      'Status 500 retornado pelo endpoint /v1/token.',
    ]);
    expect(postBody.context.evidences).toHaveLength(1);

    // Act — Consulta diagnóstico salvo
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Assert GET
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.id).toBe(postBody.id);
    expect(getBody.isOutdated).toBe(false);
    expect(getBody.result).toEqual(postBody.result);
  });

  it('CA-02 e RN-03: deve abortar com HTTP 400 Bad Request quando o double-check detectar credencial nas evidências', async () => {
    // Arrange
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
        occurrenceId,
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.auth.com/v1/token',
        headers: {
          Authorization: 'Bearer sk-live-secret999888777666555444',
        },
      },
      noopDetector,
    );
    await evidenceRepository.save(unsafeEvidence);

    const app = createTestServer();

    // Act
    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe(SECRET_ALERT_MESSAGE);
    expect(body.fields).toContain('headers');
    expect(mockDiagnosisGenerator.generate).not.toHaveBeenCalled();
  });

  it('CA-03: deve retornar HTTP 502 e preservar diagnóstico anterior quando ocorrer falha estrutural (Schema Mismatch)', async () => {
    // Arrange
    const app = createTestServer();
    await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    vi.mocked(mockDiagnosisGenerator.generate).mockRejectedValueOnce(
      new DiagnosisSchemaMismatchError(),
    );

    // Act
    const failRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Assert
    expect(failRes.statusCode).toBe(502);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().result.facts_observed).toEqual([
      'Status 500 retornado pelo endpoint /v1/token.',
    ]);
  });

  it('CA-05: deve marcar isOutdated = true no GET /api/occurrences/:id/diagnosis após adicionar ou editar evidência via HTTP', async () => {
    // Arrange
    const app = createTestServer();
    await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Act — Adiciona nova evidência via POST
    await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'MANUAL_NOTE',
        content: 'Nova observação adicionada após o diagnóstico',
      },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Assert
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().isOutdated).toBe(true);
  });

  it('CA-06: deve retornar HTTP 504 quando o provedor de IA exceder o tempo limite (Timeout)', async () => {
    // Arrange
    vi.mocked(mockDiagnosisGenerator.generate).mockRejectedValueOnce(new DiagnosisTimeoutError());
    const app = createTestServer();

    // Act
    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
    });

    // Assert
    expect(res.statusCode).toBe(504);
    expect(res.json().error).toContain('Timeout');
  });
});
