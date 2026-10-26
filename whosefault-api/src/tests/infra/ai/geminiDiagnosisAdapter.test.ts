/**
 * Testes unitários para o adaptador GeminiDiagnosisAdapter.
 *
 * Referências de Especificação e Arquitetura:
 * - SPEC-04 (RF-04, RF-09, CA-01, CA-03, CA-06)
 * - ADR-003 (Integração com IA, isolamento do provedor e validação estrutural via Zod)
 * - ADR-004 (Segurança — uso exclusivo de GEMINI_API_KEY_FREETIER e proteção de logs)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GeminiDiagnosisAdapter,
  DIAGNOSIS_SYSTEM_INSTRUCTION,
  type GeminiDiagnosisContentClient,
} from '../../../infra/ai/geminiDiagnosisAdapter.js';
import {
  DiagnosisProviderError,
  DiagnosisSchemaMismatchError,
  DiagnosisTimeoutError,
} from '../../../domain/services/IDiagnosisGenerator.js';
import type { DiagnosisContext } from '../../../domain/diagnosis.js';

describe('GeminiDiagnosisAdapter (SPEC-04 / ADR-003 / ADR-004)', () => {
  const originalEnv = process.env.GEMINI_API_KEY_FREETIER;
  const FAKE_API_KEY = 'AIzaSyFakeFreeTierKeyForDiagnosisUnitTest123';

  let mockGenerateContent: ReturnType<
    typeof vi.fn<GeminiDiagnosisContentClient['models']['generateContent']>
  >;
  let mockClient: GeminiDiagnosisContentClient;
  let sampleContext: DiagnosisContext;

  beforeEach(() => {
    process.env.GEMINI_API_KEY_FREETIER = FAKE_API_KEY;
    mockGenerateContent = vi.fn<GeminiDiagnosisContentClient['models']['generateContent']>();
    mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    };

    sampleContext = {
      occurrence: {
        id: 'occ-123',
        apiName: 'API Pagamentos',
        url: 'https://api.pagamentos.com/v1/charges',
        method: 'POST',
        description: 'Retorna 502 intermitente ao cobrar cartão.',
      },
      evidences: [
        {
          id: 'ev-1',
          type: 'HTTP_RESPONSE',
          statusCode: 502,
          body: '{"error":"Bad Gateway"}',
        },
      ],
    };
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.GEMINI_API_KEY_FREETIER;
    } else {
      process.env.GEMINI_API_KEY_FREETIER = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it('CA-01: deve retornar o objeto validado pelo Zod quando o Gemini responder no schema esperado com responseMimeType application/json', async () => {
    // Arrange
    const validResponse = {
      facts_observed: ['A API retornou HTTP 502 Bad Gateway.'],
      hypotheses: [
        {
          cause: 'Indisponibilidade temporária do servidor upstream.',
          evidence_support: 'Evidência ev-1 apresenta statusCode 502 e corpo Bad Gateway.',
        },
      ],
      missing_information: ['Logs do gateway de entrada e tempo de resposta do upstream.'],
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validResponse),
    });

    const adapter = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });

    // Act
    const result = await adapter.generate(sampleContext);

    // Assert
    expect(result).toEqual(validResponse);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: JSON.stringify(sampleContext),
        config: expect.objectContaining({
          systemInstruction: DIAGNOSIS_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
        }),
      }),
    );
  });

  it('CA-03: deve lançar DiagnosisSchemaMismatchError quando o JSON retornado pelo Gemini falhar na validação do Zod', async () => {
    // Arrange (Falta missing_information e hypotheses está com formato incorreto)
    const invalidSchemaPayload = {
      facts_observed: ['Status 502 observado'],
      hypotheses: ['Hipótese sem objeto cause/evidence_support'],
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(invalidSchemaPayload),
    });

    const adapter = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });

    // Act & Assert
    await expect(adapter.generate(sampleContext)).rejects.toThrow(DiagnosisSchemaMismatchError);
  });

  it('CA-03: deve lançar DiagnosisSchemaMismatchError quando o Gemini retornar texto que não é JSON válido ou vazio', async () => {
    // Arrange
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Desculpe, não consegui analisar em JSON.',
    });

    const adapter = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });

    // Act & Assert
    await expect(adapter.generate(sampleContext)).rejects.toThrow(DiagnosisSchemaMismatchError);
  });

  it('CA-06: deve abortar e lançar DiagnosisTimeoutError quando o tempo limite for excedido', async () => {
    // Arrange
    mockGenerateContent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ text: '{}' }), 200);
        }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const adapter = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
      timeoutMs: 30,
    });

    // Act & Assert
    await expect(adapter.generate(sampleContext)).rejects.toThrow(DiagnosisTimeoutError);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('ADR-004: deve lançar DiagnosisProviderError quando GEMINI_API_KEY_FREETIER não estiver configurada e nunca vazar a chave nos logs', async () => {
    // Arrange
    delete process.env.GEMINI_API_KEY_FREETIER;
    const adapterWithoutKey = new GeminiDiagnosisAdapter({
      client: mockClient,
    });

    // Act & Assert
    await expect(adapterWithoutKey.generate(sampleContext)).rejects.toThrow(DiagnosisProviderError);
    expect(mockGenerateContent).not.toHaveBeenCalled();

    // Testa proteção de logs quando SDK lança erro contendo a chave
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerateContent.mockRejectedValueOnce(
      new Error(`Request failed with key=${FAKE_API_KEY}`),
    );

    const adapterWithKey = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });

    await expect(adapterWithKey.generate(sampleContext)).rejects.toThrow(DiagnosisProviderError);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(FAKE_API_KEY);
  });
});
