import { GoogleGenAI } from '@google/genai';
import type { ITitleGenerator } from '../../domain/services/ITitleGenerator.js';
import type { ISecretDetector } from '../../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../../domain/services/secretDetector.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

export const TITLE_SYSTEM_INSTRUCTION =
  'Você é um assistente técnico. Gere um título curto de no máximo 6 a 8 palavras, ' +
  'em português, resumindo o problema técnico relatado na descrição. ' +
  'Retorne apenas o título em linha única, sem aspas, sem markdown e sem pontuação final excessiva.';

/**
 * Interface mínima do cliente Gemini utilizada pelo adaptador.
 * Facilita a injeção de mocks determinísticos nos testes unitários (ADR-003).
 */
export interface GeminiContentClient {
  models: {
    generateContent(params: {
      model: string;
      contents: string;
      config?: {
        systemInstruction?: string;
        temperature?: number;
        maxOutputTokens?: number;
      };
    }): Promise<{ text?: string | undefined }>;
  };
}

export interface GeminiTitleGeneratorOptions {
  apiKey?: string;
  model?: string;
  secretDetector?: ISecretDetector;
  client?: GeminiContentClient;
}

/**
 * Remove aspas envolventes, quebras de linha e pontuação final excessiva do título gerado.
 */
function sanitizeGeneratedTitle(rawText: string | undefined): string | null {
  if (!rawText) {
    return null;
  }

  const singleLine = rawText
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim()
    .replace(/[.!?;:,]+$/g, '')
    .trim();

  return singleLine.length > 0 ? singleLine : null;
}

/**
 * Adaptador concreto para geração de títulos utilizando o SDK oficial @google/genai.
 *
 * Cumpre:
 * - SPEC-01 (RF-03, RF-04, RN-06, RN-09, CA-05, CA-06, CA-13)
 * - ADR-003 (Isolamento do provedor e degradação graciosa)
 * - ADR-004 (Verificação prévia via ISecretDetector e proteção de credenciais em logs)
 */
export class GeminiTitleGenerator implements ITitleGenerator {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly secretDetector: ISecretDetector;
  private client: GeminiContentClient | undefined;

  constructor(options: GeminiTitleGeneratorOptions = {}) {
    // IMPORTANTE: Utiliza exclusivamente GEMINI_API_KEY_FREETIER neste momento
    const rawKey = options.apiKey ?? process.env.GEMINI_API_KEY_FREETIER;
    this.apiKey = rawKey && rawKey.trim().length > 0 ? rawKey.trim() : undefined;
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.secretDetector = options.secretDetector ?? defaultSecretDetector;
    this.client = options.client;
  }

  async generate(description: string): Promise<string | null> {
    if (!description || description.trim().length === 0) {
      return null;
    }

    if (!this.apiKey) {
      console.warn(
        '[GeminiTitleGenerator] GEMINI_API_KEY_FREETIER não configurada. Retornando null (degradação graciosa).',
      );
      return null;
    }

    // Verificação prévia de segurança antes de enviar à API externa (ADR-003 §5 / ADR-004 §3)
    const inspection = this.secretDetector.inspect({ content: description });
    if (inspection.hasSecrets) {
      console.warn(
        '[GeminiTitleGenerator] Geração de título bloqueada: possível segredo ou credencial detectado na descrição.',
      );
      return null;
    }

    try {
      const aiClient = this.getOrCreateClient(this.apiKey);
      const response = await aiClient.models.generateContent({
        model: this.model,
        contents: description,
        config: {
          systemInstruction: TITLE_SYSTEM_INSTRUCTION,
          temperature: 0.2,
          maxOutputTokens: 60,
        },
      });

      return sanitizeGeneratedTitle(response?.text);
    } catch (err) {
      // Nenhuma credencial, chave de API ou descrição sensível é exposta nos logs (ADR-004 §5)
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const errorStatus =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      console.error('[GeminiTitleGenerator] Falha ao gerar título via Gemini API.', {
        errorName,
        model: this.model,
        ...(errorStatus !== undefined ? { status: errorStatus } : {}),
      });
      return null;
    }
  }

  private getOrCreateClient(apiKey: string): GeminiContentClient {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }
}
