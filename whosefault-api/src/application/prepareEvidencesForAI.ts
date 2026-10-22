import type { Evidence } from '../domain/evidence.js';
import type { ISecretDetector } from '../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../domain/services/secretDetector.js';
import { mapEvidenceToResult, type IEvidenceResult } from './createEvidence.js';

/**
 * Contrato para consumidor de evidências pela IA (ex: gerador de diagnóstico).
 * Permite testar o bloqueio de envio à IA via Inversão de Dependência (Stubs/Mocks)
 * sem conectar a um provedor real (RF-11 / CA-15).
 */
export interface IAIEvidenceConsumer<TResult = void> {
  processEvidences(evidences: IEvidenceResult[]): Promise<TResult>;
}

/**
 * Serviço de aplicação: Verifica e prepara evidências antes do envio à IA (SPEC-03 RF-11, CA-15, ADR-004).
 *
 * - Revalida todas as evidências através do ISecretDetector antes de encaminhar à IA.
 * - Caso identifique qualquer segredo desprotegido, bloqueia o envio lançando SensitiveDataDetectedError.
 * - Caso um consumidor de IA seja fornecido, repassa apenas evidências devidamente validadas.
 */
export async function prepareEvidencesForAI<TResult = IEvidenceResult[]>(
  evidences: Evidence[],
  secretDetector: ISecretDetector = defaultSecretDetector,
  aiConsumer?: IAIEvidenceConsumer<TResult>,
): Promise<TResult | IEvidenceResult[]> {
  for (const evidence of evidences) {
    secretDetector.assertNoSecrets({
      url: evidence.url,
      headers: evidence.headers,
      payload: evidence.payload,
      body: evidence.body,
      content: evidence.content,
      context: evidence.context,
      notes: evidence.notes,
    });
  }

  const safeEvidences = evidences.map(mapEvidenceToResult);

  if (aiConsumer) {
    return aiConsumer.processEvidences(safeEvidences);
  }

  return safeEvidences;
}
