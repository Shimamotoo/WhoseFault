import type { DiagnosisContext, DiagnosisResult } from '../diagnosis.js';

export class DiagnosisSchemaMismatchError extends Error {
  constructor(
    message = 'A resposta retornada pela IA não atende ao contrato estrutural esperado (Schema Mismatch).',
  ) {
    super(message);
    this.name = 'DiagnosisSchemaMismatchError';
  }
}

export class DiagnosisTimeoutError extends Error {
  constructor(
    message = 'O tempo limite de resposta do provedor de IA foi excedido (Timeout).',
  ) {
    super(message);
    this.name = 'DiagnosisTimeoutError';
  }
}

export class DiagnosisProviderError extends Error {
  constructor(message = 'Falha ao gerar diagnóstico junto ao provedor de IA.') {
    super(message);
    this.name = 'DiagnosisProviderError';
  }
}

/**
 * Contrato para o adaptador de geração de diagnóstico assistido por IA (SPEC-04 / ADR-003).
 */
export interface IDiagnosisGenerator {
  generate(context: DiagnosisContext): Promise<DiagnosisResult>;
}
