import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  GenerateDiagnosisUseCase,
  SecurityError,
  mapDiagnosisToDTO,
} from '../../application/useCases/generateDiagnosisUseCase.js';
import { OccurrenceNotFoundError } from '../../application/updateOccurrence.js';
import {
  assertOccurrenceOwnership,
  UnauthorizedOccurrenceAccessError,
} from '../../application/occurrenceOwnership.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../../domain/repositories/IDiagnosisRepository.js';
import {
  DiagnosisProviderError,
  DiagnosisSchemaMismatchError,
  DiagnosisTimeoutError,
  type IDiagnosisGenerator,
} from '../../domain/services/IDiagnosisGenerator.js';
import {
  SensitiveDataDetectedError,
  type ISecretDetector,
} from '../../domain/services/ISecretDetector.js';
import type { IStorageService } from '../../domain/services/IStorageService.js';
import { defaultSecretDetector } from '../../domain/services/secretDetector.js';

export interface DiagnosisRoutesOptions {
  occurrenceRepository: IOccurrenceRepository;
  evidenceRepository: IEvidenceRepository;
  diagnosisRepository: IDiagnosisRepository;
  diagnosisGenerator: IDiagnosisGenerator;
  secretDetector?: ISecretDetector;
  storageService?: IStorageService;
  authHook?: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/** Rotas referentes ao Diagnóstico Assistido por IA (SPEC-04 e SPEC-08) */
const diagnosisRoutes: FastifyPluginAsync<DiagnosisRoutesOptions> = async (app, opts) => {
  const {
    occurrenceRepository,
    evidenceRepository,
    diagnosisRepository,
    diagnosisGenerator,
    storageService,
    authHook,
  } = opts;
  const secretDetector = opts.secretDetector ?? defaultSecretDetector;
  const preHandler = authHook ? [authHook] : [];

  const generateDiagnosisUseCase = new GenerateDiagnosisUseCase({
    occurrenceRepository,
    evidenceRepository,
    diagnosisRepository,
    diagnosisGenerator,
    secretDetector,
    storageService,
  });

  // ------------------------------------------------------------------ //
  // POST /occurrences/:id/diagnosis — Solicitar diagnóstico (SPEC-04 RF-01 a RF-06)
  // ------------------------------------------------------------------ //
  app.post('/occurrences/:id/diagnosis', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    try {
      const output = await generateDiagnosisUseCase.execute(id, req.user?.id);

      if (output.discardedByConcurrency || !output.diagnosis) {
        return reply.code(409).send({
          discardedByConcurrency: true,
          message:
            'Os dados da ocorrência ou de suas evidências foram alterados durante o processamento. O diagnóstico gerado foi descartado para preservar a integridade.',
        });
      }

      return reply.code(200).send(output.diagnosis);
    } catch (err) {
      if (err instanceof UnauthorizedOccurrenceAccessError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }

      // RN-03: A detecção tardia de segredos (double-check) aborta o processo com HTTP 400 - Bad Request
      if (err instanceof SecurityError || err instanceof SensitiveDataDetectedError) {
        return reply.code(400).send({
          error: err.alertMessage,
          guidance: err.securityGuidance,
          fields: err.detectedFields,
        });
      }

      // RF-09 / CA-03: Falha na validação estrutural (Zod Schema Mismatch)
      if (err instanceof DiagnosisSchemaMismatchError) {
        return reply.code(502).send({
          error: err.message,
        });
      }

      // RF-09 / CA-06: Timeout do provedor de IA
      if (err instanceof DiagnosisTimeoutError) {
        return reply.code(504).send({
          error: err.message,
        });
      }

      if (err instanceof DiagnosisProviderError) {
        return reply.code(502).send({
          error: err.message,
        });
      }

      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Erro ao gerar diagnóstico.');
      return reply.code(500).send({ error: 'Falha ao gerar diagnóstico.' });
    }
  });

  // ------------------------------------------------------------------ //
  // GET /occurrences/:id/diagnosis — Consultar diagnóstico salvo (SPEC-04 RF-08)
  // ------------------------------------------------------------------ //
  app.get('/occurrences/:id/diagnosis', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    try {
      const occurrence = await occurrenceRepository.findById(id);
      if (!occurrence) {
        return reply.code(404).send({ error: `Ocorrência não encontrada: ${id}` });
      }

      assertOccurrenceOwnership(occurrence, req.user?.id);

      const diagnosis = await diagnosisRepository.findByOccurrenceId(id);
      if (!diagnosis) {
        return reply.code(404).send({ error: 'Nenhum diagnóstico encontrado para esta ocorrência.' });
      }

      return reply.code(200).send(mapDiagnosisToDTO(diagnosis));
    } catch (err) {
      if (err instanceof UnauthorizedOccurrenceAccessError) {
        return reply.code(401).send({ error: err.message });
      }
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      req.log.error({ errName: err instanceof Error ? err.name : 'UnknownError' }, 'Erro ao consultar diagnóstico.');
      return reply.code(500).send({ error: 'Falha ao consultar diagnóstico.' });
    }
  });
};

export default diagnosisRoutes;
