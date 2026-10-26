import type {
  Diagnosis,
  DiagnosisContext,
  DiagnosisEvidenceSnapshot,
  DiagnosisResult,
} from '../../domain/diagnosis.js';
import type { Evidence } from '../../domain/evidence.js';
import type { Occurrence } from '../../domain/occurrence.js';
import type { IDiagnosisRepository } from '../../domain/repositories/IDiagnosisRepository.js';
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IDiagnosisGenerator } from '../../domain/services/IDiagnosisGenerator.js';
import {
  SensitiveDataDetectedError,
  type ISecretDetector,
} from '../../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../../domain/services/secretDetector.js';
import { prismaDiagnosisRepository } from '../../infra/repositories/prismaDiagnosisRepository.js';
import { OccurrenceNotFoundError } from '../updateOccurrence.js';

/**
 * Exceção lançada quando o double-check de segurança detecta credenciais ou segredos
 * no contexto compilado antes do envio para a IA (SPEC-04 RF-03, RN-03, CA-02, ADR-004).
 */
export class SecurityError extends SensitiveDataDetectedError {
  constructor(detectedFields: string[]) {
    super(detectedFields);
    this.name = 'SecurityError';
  }
}

export interface IDiagnosisDTO {
  id: string;
  occurrenceId: string;
  context: DiagnosisContext;
  result: DiagnosisResult;
  isOutdated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGenerateDiagnosisOutput {
  discardedByConcurrency: boolean;
  diagnosis: IDiagnosisDTO | null;
}

export function mapDiagnosisToDTO(diagnosis: Diagnosis): IDiagnosisDTO {
  return {
    id: diagnosis.id,
    occurrenceId: diagnosis.occurrenceId,
    context: diagnosis.context,
    result: diagnosis.result,
    isOutdated: diagnosis.isOutdated,
    createdAt: diagnosis.createdAt,
    updatedAt: diagnosis.updatedAt,
  };
}

function mapEvidenceToSnapshot(evidence: Evidence): DiagnosisEvidenceSnapshot {
  return {
    id: evidence.id,
    type: evidence.type,
    ...(evidence.method !== undefined ? { method: evidence.method } : {}),
    ...(evidence.url !== undefined ? { url: evidence.url } : {}),
    ...(evidence.statusCode !== undefined ? { statusCode: evidence.statusCode } : {}),
    ...(evidence.headers !== undefined ? { headers: { ...evidence.headers } } : {}),
    ...(evidence.payload !== undefined ? { payload: evidence.payload } : {}),
    ...(evidence.body !== undefined ? { body: evidence.body } : {}),
    ...(evidence.content !== undefined ? { content: evidence.content } : {}),
    ...(evidence.context !== undefined ? { context: evidence.context } : {}),
    ...(evidence.notes !== undefined ? { notes: evidence.notes } : {}),
  };
}

function computeMaxUpdatedAt(occurrence: Occurrence, evidences: Evidence[]): number {
  let maxTime = occurrence.updatedAt.getTime();
  for (const ev of evidences) {
    const evTime = ev.updatedAt.getTime();
    if (evTime > maxTime) {
      maxTime = evTime;
    }
  }
  return maxTime;
}

function computeConcurrencySignature(occurrence: Occurrence, evidences: Evidence[]): string {
  const sortedEvidences = [...evidences]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => `${e.id}:${e.updatedAt.getTime()}:${JSON.stringify(mapEvidenceToSnapshot(e))}`)
    .join('|');
  return `${occurrence.id}:${occurrence.updatedAt.getTime()}:${occurrence.apiName}:${occurrence.url}:${occurrence.method}:${occurrence.description ?? ''}#${sortedEvidences}`;
}

export interface GenerateDiagnosisDependencies {
  occurrenceRepository: IOccurrenceRepository;
  evidenceRepository: IEvidenceRepository;
  diagnosisGenerator: IDiagnosisGenerator;
  diagnosisRepository?: IDiagnosisRepository;
  secretDetector?: ISecretDetector;
}

/**
 * Caso de Uso: Solicitar e gerar diagnóstico assistido por IA para uma ocorrência (SPEC-04).
 *
 * Passos:
 * 1. Busca a Ocorrência e todas as Evidências associadas, armazenando o maior updatedAt e assinatura do estado.
 * 2. Executa o double-check de segurança via ISecretDetector sobre o contexto compilado (lança SecurityError se detectar segredo).
 * 3. Aciona o adaptador de IA (IDiagnosisGenerator / GeminiDiagnosisAdapter).
 * 4. Antes de persistir, revalida a concorrência verificando se updatedAt ou a lista de evidências mudaram no banco; se mudou, descarta silenciosamente.
 * 5. Executa o UPSERT do diagnóstico salvando context e result em JSONB com isOutdated = false.
 */
export class GenerateDiagnosisUseCase {
  private readonly occurrenceRepository: IOccurrenceRepository;
  private readonly evidenceRepository: IEvidenceRepository;
  private readonly diagnosisGenerator: IDiagnosisGenerator;
  private readonly diagnosisRepository: IDiagnosisRepository;
  private readonly secretDetector: ISecretDetector;

  constructor(deps: GenerateDiagnosisDependencies) {
    this.occurrenceRepository = deps.occurrenceRepository;
    this.evidenceRepository = deps.evidenceRepository;
    this.diagnosisGenerator = deps.diagnosisGenerator;
    this.diagnosisRepository = deps.diagnosisRepository ?? prismaDiagnosisRepository;
    this.secretDetector = deps.secretDetector ?? defaultSecretDetector;
  }

  async execute(occurrenceId: string): Promise<IGenerateDiagnosisOutput> {
    // Passo 1: Buscar a Ocorrência e todas as Evidências associadas e armazenar maior updatedAt
    const occurrence = await this.occurrenceRepository.findById(occurrenceId);
    if (!occurrence) {
      throw new OccurrenceNotFoundError(occurrenceId);
    }

    const evidences = await this.evidenceRepository.findByOccurrenceId(occurrenceId);
    const initialMaxUpdatedAt = computeMaxUpdatedAt(occurrence, evidences);
    const initialSignature = computeConcurrencySignature(occurrence, evidences);

    const context: DiagnosisContext = {
      occurrence: {
        id: occurrence.id,
        apiName: occurrence.apiName,
        url: occurrence.url,
        method: occurrence.method,
        ...(occurrence.description !== undefined ? { description: occurrence.description } : {}),
      },
      evidences: evidences.map(mapEvidenceToSnapshot),
    };

    // Passo 2: Double-check de segurança pelo ISecretDetector em todo o contexto compilado
    const occInspection = this.secretDetector.inspect({
      url: context.occurrence.url,
      content: context.occurrence.description,
    });
    if (occInspection.hasSecrets) {
      throw new SecurityError(occInspection.detectedFields);
    }

    for (const evidence of context.evidences) {
      const evInspection = this.secretDetector.inspect({
        url: evidence.url,
        headers: evidence.headers,
        payload: evidence.payload,
        body: evidence.body,
        content: evidence.content,
        context: evidence.context,
        notes: evidence.notes,
      });

      if (evInspection.hasSecrets) {
        throw new SecurityError(evInspection.detectedFields);
      }
    }

    // Passo 3: Chamar o GeminiDiagnosisAdapter (IDiagnosisGenerator)
    const aiResult = await this.diagnosisGenerator.generate(context);

    // Passo 4: Refazer a checagem de concorrência antes de persistir (RF-06 / RN-04 / CA-04)
    const currentOccurrence = await this.occurrenceRepository.findById(occurrenceId);
    if (!currentOccurrence) {
      // A ocorrência foi excluída durante o processamento da IA -> descarta silenciosamente
      return {
        discardedByConcurrency: true,
        diagnosis: null,
      };
    }

    const currentEvidences = await this.evidenceRepository.findByOccurrenceId(occurrenceId);
    const currentMaxUpdatedAt = computeMaxUpdatedAt(currentOccurrence, currentEvidences);
    const currentSignature = computeConcurrencySignature(currentOccurrence, currentEvidences);

    if (
      currentMaxUpdatedAt !== initialMaxUpdatedAt ||
      currentSignature !== initialSignature
    ) {
      // Mutações ocorreram nos dados durante a requisição à IA -> descarta silenciosamente o payload
      return {
        discardedByConcurrency: true,
        diagnosis: null,
      };
    }

    // Passo 5: Persistir via UPSERT (mantendo relação 1:1) com context, result e isOutdated: false
    const savedDiagnosis = await this.diagnosisRepository.upsert({
      occurrenceId,
      context,
      result: aiResult,
      isOutdated: false,
    });

    return {
      discardedByConcurrency: false,
      diagnosis: mapDiagnosisToDTO(savedDiagnosis),
    };
  }
}
