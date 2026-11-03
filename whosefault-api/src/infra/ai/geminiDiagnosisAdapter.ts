import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type { DiagnosisContext, DiagnosisResult } from '../../domain/diagnosis.js';
import {
  DiagnosisProviderError,
  DiagnosisSchemaMismatchError,
  DiagnosisTimeoutError,
  type DiagnosisInlineImage,
  type GenerateDiagnosisOptions,
  type IDiagnosisGenerator,
} from '../../domain/services/IDiagnosisGenerator.js';
import type { IStorageService } from '../../domain/services/IStorageService.js';
import { DEFAULT_GEMINI_MODEL } from './geminiTitleGenerator.js';

export const DEFAULT_DIAGNOSIS_TIMEOUT_MS = 45_000;

export const DIAGNOSIS_SYSTEM_INSTRUCTION =
  'Você é um engenheiro especialista em diagnóstico de falhas e incidentes em integrações de APIs. ' +
  'Analise estritamente o contexto da ocorrência e as evidências fornecidas (requisições HTTP, respostas HTTP, logs de erro, observações manuais e capturas de tela/fotos anexadas). ' +
  'Quando houver imagens anexadas (prints de ferramentas como Postman, Insomnia, navegador/DevTools, terminais, logs visuais ou telas de erro), extraia minuciosamente códigos de status HTTP, cabeçalhos, mensagens de erro, payloads visíveis e correlacione-os com as evidências textuais. ' +
  'Não invente fatos, não assuma dados ausentes como certezas e não modifique os dados originais. ' +
  'Retorne exclusivamente um objeto JSON válido contendo: ' +
  '1) "facts_observed": lista de fatos concretos diretamente observados nas evidências textuais e visuais; ' +
  '2) "hypotheses": lista de objetos com "cause" (hipótese técnica fundamentada para a falha) e "evidence_support" (quais evidências, inclusive visuais pelo ID, sustentam essa hipótese); ' +
  '3) "missing_information": lista de informações técnicas ausentes nas evidências que limitam a conclusão e ajudariam a refinar a investigação.';

export const DiagnosisResultZodSchema = z.object({
  facts_observed: z.array(z.string()),
  hypotheses: z.array(
    z.object({
      cause: z.string(),
      evidence_support: z.string(),
    }),
  ),
  missing_information: z.array(z.string()),
});

export const GEMINI_DIAGNOSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    facts_observed: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Fatos concretos observados nas evidências da ocorrência.',
    },
    hypotheses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cause: {
            type: Type.STRING,
            description: 'Hipótese fundamentada sobre a causa do erro.',
          },
          evidence_support: {
            type: Type.STRING,
            description: 'Evidências específicas que sustentam a hipótese.',
          },
        },
        required: ['cause', 'evidence_support'],
      },
      description: 'Hipóteses levantadas a partir das evidências disponíveis.',
    },
    missing_information: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Informações vitais ausentes nas evidências que limitam a conclusão.',
    },
  },
  required: ['facts_observed', 'hypotheses', 'missing_information'],
};

export type GeminiDiagnosisContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiDiagnosisContents = string | GeminiDiagnosisContentPart[];

/**
 * Interface mínima do cliente Gemini utilizada pelo adaptador de diagnóstico.
 * Facilita a injeção de mocks determinísticos nos testes unitários (ADR-003).
 */
export interface GeminiDiagnosisContentClient {
  models: {
    generateContent(params: {
      model: string;
      contents: GeminiDiagnosisContents;
      config?: {
        systemInstruction?: string;
        responseMimeType?: string;
        responseSchema?: unknown;
        temperature?: number;
        abortSignal?: AbortSignal;
      };
    }): Promise<{ text?: string | undefined }>;
  };
}

export interface GeminiDiagnosisAdapterOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  client?: GeminiDiagnosisContentClient;
  storageService?: IStorageService;
}

/**
 * Adaptador concreto para geração de diagnóstico assistido por IA via @google/genai.
 *
 * Cumpre:
 * - SPEC-04 (RF-04, RF-09, CA-01, CA-03, CA-06)
 * - SPEC-08 (RF-05, CA-05 — Conversão sob demanda para Base64 e envio multimodal inlineData)
 * - ADR-003 (Isolamento do provedor e validação estrutural da resposta via Zod)
 * - ADR-004 (Uso exclusivo de GEMINI_API_KEY_FREETIER e proteção contra vazamento em logs)
 */
export class GeminiDiagnosisAdapter implements IDiagnosisGenerator {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly storageService: IStorageService | undefined;
  private client: GeminiDiagnosisContentClient | undefined;

  constructor(options: GeminiDiagnosisAdapterOptions = {}) {
    // IMPORTANTE: Utiliza exclusivamente GEMINI_API_KEY_FREETIER neste momento (nunca GEMINI_API_KEY_PROD)
    const rawKey = options.apiKey ?? process.env.GEMINI_API_KEY_FREETIER;
    this.apiKey = rawKey && rawKey.trim().length > 0 ? rawKey.trim() : undefined;
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_DIAGNOSIS_TIMEOUT_MS;
    this.storageService = options.storageService;
    this.client = options.client;
  }

  async generate(
    context: DiagnosisContext,
    options?: GenerateDiagnosisOptions,
  ): Promise<DiagnosisResult> {
    if (!this.apiKey) {
      throw new DiagnosisProviderError(
        'GEMINI_API_KEY_FREETIER não configurada para geração de diagnóstico.',
      );
    }

    const aiClient = this.getOrCreateClient(this.apiKey);

    let resolvedImages: DiagnosisInlineImage[] = options?.images ? [...options.images] : [];
    const unavailableIds: string[] = options?.unavailableImageEvidenceIds
      ? [...options.unavailableImageEvidenceIds]
      : [];

    if (!options?.images && this.storageService) {
      for (const ev of context.evidences) {
        if (ev.type === 'IMAGE' && ev.url) {
          try {
            const { base64, mimeType } = await this.storageService.getFileBase64(ev.url);
            resolvedImages.push({
              evidenceId: ev.id,
              mimeType: ev.headers?.contentType || mimeType,
              base64Data: base64,
              notes: ev.notes,
            });
          } catch {
            unavailableIds.push(ev.id);
          }
        }
      }
    }

    const serializedContext = JSON.stringify(context);
    const contents: GeminiDiagnosisContents =
      resolvedImages.length === 0
        ? serializedContext
        : [
            { text: serializedContext },
            ...resolvedImages.flatMap((img): GeminiDiagnosisContentPart[] => [
              {
                text: `Evidência visual anexada (ID: ${img.evidenceId}${img.notes ? ` | Notas: ${img.notes}` : ''}):`,
              },
              {
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.base64Data,
                },
              },
            ]),
          ];

    let rawText: string | undefined;

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new DiagnosisTimeoutError());
      }, this.timeoutMs);
    });

    try {
      const response = await Promise.race([
        aiClient.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction: DIAGNOSIS_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_DIAGNOSIS_RESPONSE_SCHEMA,
            temperature: 0.2,
            abortSignal: controller.signal,
          },
        }),
        timeoutPromise,
      ]);

      rawText = response?.text;
    } catch (err) {
      if (err instanceof DiagnosisTimeoutError) {
        console.error('[GeminiDiagnosisAdapter] Timeout ao aguardar resposta do Gemini API.', {
          model: this.model,
          timeoutMs: this.timeoutMs,
        });
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[GeminiDiagnosisAdapter] Requisição abortada por timeout no Gemini API.', {
          model: this.model,
          timeoutMs: this.timeoutMs,
        });
        throw new DiagnosisTimeoutError();
      }

      // Nunca expõe a chave da API nem o payload de contexto nos logs (ADR-004 §5)
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorStatus =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      console.error('[GeminiDiagnosisAdapter] Falha ao comunicar com Gemini API.', {
        errorName,
        model: this.model,
        ...(errorStatus !== undefined ? { status: errorStatus } : {}),
      });

      throw new DiagnosisProviderError('Falha ao obter resposta do provedor de IA.');
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new DiagnosisSchemaMismatchError(
        'O provedor de IA retornou uma resposta vazia para o diagnóstico.',
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new DiagnosisSchemaMismatchError(
        'O provedor de IA retornou um conteúdo que não é um JSON válido.',
      );
    }

    const validation = DiagnosisResultZodSchema.safeParse(parsedJson);
    if (!validation.success) {
      throw new DiagnosisSchemaMismatchError(
        'O JSON retornado pela IA não corresponde ao schema exigido pelo diagnóstico.',
      );
    }

    const result = validation.data;
    if (unavailableIds.length > 0) {
      result.missing_information = [
        ...result.missing_information,
        `Não foi possível carregar no storage ${unavailableIds.length} evidência(s) de imagem (${unavailableIds.join(', ')}).`,
      ];
    }

    return result;
  }

  private getOrCreateClient(apiKey: string): GeminiDiagnosisContentClient {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }
}
