/**
 * Testes unitários para o adaptador GeminiTitleGenerator.
 *
 * Skill utilizada: TDD & Test Generator (whosefault-docs/.antigravity/skills/test-generator.md)
 *
 * Referências de Especificação e Arquitetura:
 * - SPEC-01 (RF-03, RF-04, RN-06, RN-09, CA-05, CA-06, CA-13)
 * - ADR-003 (Integração com IA e isolamento do provedor)
 * - ADR-004 (Segurança e tratamento de dados — verificação prévia e proteção de logs)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GeminiTitleGenerator,
  TITLE_SYSTEM_INSTRUCTION,
  type GeminiContentClient,
} from '../../../infra/ai/geminiTitleGenerator.js';
import { PatternSecretDetector } from '../../../domain/services/secretDetector.js';
import type { ISecretDetector } from '../../../domain/services/ISecretDetector.js';

describe('GeminiTitleGenerator (SPEC-01 / ADR-003 / ADR-004)', () => {
  const originalEnv = process.env.GEMINI_API_KEY_FREETIER;
  const FAKE_API_KEY = 'AIzaSyFakeFreeTierKeyForUnitTestingOnly123';

  let mockGenerateContent: ReturnType<typeof vi.fn<GeminiContentClient['models']['generateContent']>>;
  let mockClient: GeminiContentClient;

  beforeEach(() => {
    process.env.GEMINI_API_KEY_FREETIER = FAKE_API_KEY;
    mockGenerateContent = vi.fn<GeminiContentClient['models']['generateContent']>();
    mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
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

  it('CA-05: deve gerar um título curto e contextual sem pontuação final excessiva quando fornecida uma descrição válida', async () => {
    // Arrange (Dado que o SDK do Gemini retorna um título gerado com espaços/pontuação final)
    mockGenerateContent.mockResolvedValueOnce({
      text: '  Erro 502 ao autenticar no gateway de pagamentos...  ',
    });

    const generator = new GeminiTitleGenerator({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });
    const description =
      'Ao enviar POST para /v1/charges na API de pagamentos, recebo 502 Bad Gateway após 30 segundos.';

    // Act (Quando solicitar a geração do título)
    const result = await generator.generate(description);

    // Assert (Então deve retornar o título higienizado e ter enviado o prompt de sistema conciso)
    expect(result).toBe('Erro 502 ao autenticar no gateway de pagamentos');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: description,
        config: expect.objectContaining({
          systemInstruction: TITLE_SYSTEM_INSTRUCTION,
        }),
      }),
    );
  });

  it('CA-06: deve logar aviso e retornar null (degradação graciosa) quando GEMINI_API_KEY_FREETIER não estiver configurada', async () => {
    // Arrange (Dado que GEMINI_API_KEY_FREETIER não está definida no ambiente)
    delete process.env.GEMINI_API_KEY_FREETIER;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const generator = new GeminiTitleGenerator({
      client: mockClient,
    });

    // Act (Quando tentar gerar um título)
    const result = await generator.generate('Timeout ao consultar endpoint de pedidos.');

    // Assert (Então retorna null, loga aviso e não chama o SDK externo)
    expect(result).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('GEMINI_API_KEY_FREETIER');
  });

  it('CA-06 / CA-13: deve capturar exceções do SDK (cota, timeout ou rede) e retornar null sem propagar erro fatal', async () => {
    // Arrange (Dado que a chamada ao SDK falha por estouro de cota / timeout)
    const quotaError = new Error('429 Too Many Requests: Resource has been exhausted (e.g. check quota).');
    mockGenerateContent.mockRejectedValueOnce(quotaError);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const generator = new GeminiTitleGenerator({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });

    // Act (Quando solicitar a geração do título)
    const result = await generator.generate('Falha intermitente de conexão TLS com o serviço de estoque.');

    // Assert (Então retorna null sem lançar exceção para que a aplicação use o título genérico)
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('CA-06: deve retornar null quando o SDK retornar resposta vazia ou inutilizável', async () => {
    // Arrange (Dado que a IA retorna apenas espaços/pontuação vazia)
    mockGenerateContent.mockResolvedValueOnce({
      text: '   ...   ',
    });

    const generator = new GeminiTitleGenerator({
      apiKey: FAKE_API_KEY,
      client: mockClient,
    });

    // Act (Quando solicitar a geração do título)
    const result = await generator.generate('Resposta inesperada na rota de conciliação.');

    // Assert (Então deve considerar o resultado inutilizável e retornar null)
    expect(result).toBeNull();
  });

  it('RN-09 / ADR-004: deve bloquear o envio à API do Google e retornar null se houver segredo na descrição enviada', async () => {
    // Arrange (Dado que a descrição contém um token/segredo não mascarado)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secretDetector = new PatternSecretDetector();
    const inspectSpy = vi.spyOn(secretDetector, 'inspect');

    const generator = new GeminiTitleGenerator({
      apiKey: FAKE_API_KEY,
      client: mockClient,
      secretDetector,
    });

    const leakedToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const descriptionWithSecret = `Erro 401 ao enviar header Authorization: ${leakedToken} para a API.`;

    // Act (Quando tentar gerar um título para a descrição contendo segredo)
    const result = await generator.generate(descriptionWithSecret);

    // Assert (Então o ISecretDetector bloqueia antes da chamada, o SDK não é invocado e retorna null)
    expect(result).toBeNull();
    expect(inspectSpy).toHaveBeenCalledWith({ content: descriptionWithSecret });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Garante que o segredo não foi vazado no log de aviso
    const loggedWarning = JSON.stringify(warnSpy.mock.calls);
    expect(loggedWarning).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('RN-09 / ADR-004: não deve expor a GEMINI_API_KEY_FREETIER nem credenciais em logs de erro da IA', async () => {
    // Arrange (Dado que o SDK lança um erro cuja mensagem acidentalmente inclui a chave de API)
    const sdkErrorWithLeakedKey = new Error(
      `FetchError: request to https://generativelanguage.googleapis.com failed with key=${FAKE_API_KEY}`,
    );
    mockGenerateContent.mockRejectedValueOnce(sdkErrorWithLeakedKey);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const customDetector: ISecretDetector = {
      inspect: vi.fn().mockReturnValue({
        hasSecrets: false,
        detectedFields: [],
        alertMessage: '',
        securityGuidance: '',
      }),
      assertNoSecrets: vi.fn(),
    };

    const generator = new GeminiTitleGenerator({
      apiKey: FAKE_API_KEY,
      client: mockClient,
      secretDetector: customDetector,
    });

    // Act (Quando a chamada ao SDK falha)
    const result = await generator.generate('Erro 500 ao processar webhook.');

    // Assert (Então retorna null e nenhum argumento passado ao log contém a chave da API)
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const serializedErrorLog = JSON.stringify(errorSpy.mock.calls);
    expect(serializedErrorLog).not.toContain(FAKE_API_KEY);
  });
});
