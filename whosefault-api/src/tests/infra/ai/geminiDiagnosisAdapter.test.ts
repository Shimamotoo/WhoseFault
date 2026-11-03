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
import { StubStorageService } from '../../../infra/storage/stubStorageService.js';

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

  it('SPEC-08 CA-05: deve converter imagem do storage em Base64 e enviar como inlineData multimodal ao Gemini', async () => {
    const stubStorage = new StubStorageService();
    const fakePngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const uploaded = await stubStorage.uploadFile({
      occurrenceId: 'occ-123',
      evidenceId: 'ev-img-1',
      filename: 'postman-502.png',
      mimeType: 'image/png',
      buffer: fakePngBytes,
    });

    const contextWithImage: DiagnosisContext = {
      ...sampleContext,
      evidences: [
        ...sampleContext.evidences,
        {
          id: 'ev-img-1',
          type: 'IMAGE',
          url: uploaded.storagePath,
          headers: { contentType: 'image/png', filename: 'postman-502.png' },
          notes: 'Print do erro 502 no Postman',
        },
      ],
    };

    const validResponse = {
      facts_observed: ['Captura de tela mostra HTTP 502 Bad Gateway no Postman.'],
      hypotheses: [
        {
          cause: 'Gateway upstream indisponível.',
          evidence_support: 'Confirmado tanto em ev-1 quanto visualmente na imagem ev-img-1.',
        },
      ],
      missing_information: [],
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validResponse),
    });

    const adapter = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
      storageService: stubStorage,
    });

    const result = await adapter.generate(contextWithImage);

    expect(result).toEqual(validResponse);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateContent.mock.calls[0]?.[0];
    expect(Array.isArray(callArgs?.contents)).toBe(true);
    expect(callArgs?.contents).toEqual(
      expect.arrayContaining([
        { text: JSON.stringify(contextWithImage) },
        {
          inlineData: {
            mimeType: 'image/png',
            data: fakePngBytes.toString('base64'),
          },
        },
      ]),
    );
  });

  it('SPEC-08 RF-05: deve prosseguir e registrar em missing_information quando imagem não puder ser lida do storage', async () => {
    const stubStorage = new StubStorageService();
    const contextWithMissingImage: DiagnosisContext = {
      ...sampleContext,
      evidences: [
        ...sampleContext.evidences,
        {
          id: 'ev-img-missing',
          type: 'IMAGE',
          url: 'occurrences/occ-123/arquivo-ausente.png',
          headers: { contentType: 'image/png' },
        },
      ],
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        facts_observed: ['Status 502 em ev-1.'],
        hypotheses: [{ cause: 'Falha upstream', evidence_support: 'ev-1' }],
        missing_information: [],
      }),
    });

    const adapter = new GeminiDiagnosisAdapter({
      apiKey: FAKE_API_KEY,
      client: mockClient,
      storageService: stubStorage,
    });

    const result = await adapter.generate(contextWithMissingImage);

    expect(result.missing_information.some((m) => m.includes('ev-img-missing'))).toBe(true);
  });
});
