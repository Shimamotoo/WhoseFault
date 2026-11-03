import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createEvidence } from '../../application/createEvidence.js';
import {
  createImageEvidence,
  ImageValidationError,
} from '../../application/createImageEvidence.js';
import {
  getEvidenceImage,
  EvidenceNotAnImageError,
  UnauthorizedEvidenceAccessError,
} from '../../application/getEvidenceImage.js';
import { listEvidences } from '../../application/listEvidences.js';
import { updateEvidence, EvidenceNotFoundError } from '../../application/updateEvidence.js';
import {
  deleteEvidence,
  DeleteConfirmationRequiredError,
} from '../../application/deleteEvidence.js';
import { OccurrenceNotFoundError } from '../../application/updateOccurrence.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import type { IDiagnosisRepository } from '../../domain/repositories/IDiagnosisRepository.js';
import {
  SensitiveDataDetectedError,
  type ISecretDetector,
} from '../../domain/services/ISecretDetector.js';
import {
  StorageFileNotFoundError,
  StorageProviderError,
  type IStorageService,
} from '../../domain/services/IStorageService.js';
import { defaultSecretDetector } from '../../domain/services/secretDetector.js';
import { StubStorageService } from '../../infra/storage/stubStorageService.js';
import type { EvidenceType } from '../../domain/evidence.js';
import type { HttpMethod } from '../../domain/occurrence.js';

export interface EvidenceRoutesOptions {
  occurrenceRepository: IOccurrenceRepository;
  evidenceRepository: IEvidenceRepository;
  diagnosisRepository?: IDiagnosisRepository;
  secretDetector?: ISecretDetector;
  storageService?: IStorageService;
  authHook?: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/** Rotas referentes ao gerenciamento de evidências (SPEC-03 e SPEC-08) */
const evidenceRoutes: FastifyPluginAsync<EvidenceRoutesOptions> = async (app, opts) => {
  const { occurrenceRepository, evidenceRepository, diagnosisRepository, authHook } = opts;
  const secretDetector = opts.secretDetector ?? defaultSecretDetector;
  const storageService = opts.storageService ?? new StubStorageService();
  const preHandler = authHook ? [authHook] : [];

  // ------------------------------------------------------------------ //
  // GET /occurrences/:occurrenceId/evidences — Consultar evidências (SPEC-03 RF-06, CA-08)
  // ------------------------------------------------------------------ //
  app.get('/occurrences/:occurrenceId/evidences', { preHandler }, async (req, reply) => {
    const { occurrenceId } = req.params as { occurrenceId: string };
    try {
      const evidences = await listEvidences(occurrenceId, occurrenceRepository, evidenceRepository);
      return reply.code(200).send({ evidences });
    } catch (err) {
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      req.log.error('Erro interno ao listar evidências.');
      return reply.code(500).send({ error: 'Falha ao consultar evidências.' });
    }
  });

  // ------------------------------------------------------------------ //
  // GET /occurrences/:occurrenceId/evidences/:evidenceId/image — Visualizar foto (SPEC-08 RF-04, CA-04)
  // ------------------------------------------------------------------ //
  app.get(
    '/occurrences/:occurrenceId/evidences/:evidenceId/image',
    { preHandler },
    async (req, reply) => {
      const { occurrenceId, evidenceId } = req.params as {
        occurrenceId: string;
        evidenceId: string;
      };

      try {
        const result = await getEvidenceImage(
          {
            occurrenceId,
            evidenceId,
            userId: req.user?.id,
          },
          occurrenceRepository,
          evidenceRepository,
          storageService,
        );

        return reply
          .code(200)
          .header('Content-Type', result.mimeType)
          .header('Cache-Control', 'private, max-age=86400')
          .send(result.buffer);
      } catch (err) {
        if (err instanceof UnauthorizedEvidenceAccessError) {
          return reply.code(401).send({ error: err.message });
        }
        if (
          err instanceof OccurrenceNotFoundError ||
          err instanceof EvidenceNotFoundError ||
          err instanceof StorageFileNotFoundError
        ) {
          return reply.code(404).send({ error: err.message });
        }
        if (err instanceof EvidenceNotAnImageError) {
          return reply.code(400).send({ error: err.message });
        }
        if (err instanceof StorageProviderError) {
          return reply.code(502).send({ error: err.message });
        }
        req.log.error('Erro interno ao carregar imagem da evidência.');
        return reply.code(500).send({ error: 'Falha ao obter imagem da evidência.' });
      }
    },
  );

  // ------------------------------------------------------------------ //
  // POST /occurrences/:occurrenceId/evidences — Registrar evidência textual ou foto (SPEC-03 / SPEC-08)
  // ------------------------------------------------------------------ //
  app.post('/occurrences/:occurrenceId/evidences', { preHandler }, async (req, reply) => {
    const { occurrenceId } = req.params as { occurrenceId: string };
    const isMultipart = typeof req.isMultipart === 'function' && req.isMultipart();

    if (isMultipart) {
      try {
        let fileBuffer: Buffer | undefined;
        let filename = '';
        let mimeType = '';
        let notes: string | undefined;

        for await (const part of req.parts()) {
          if (part.type === 'file') {
            const buf = await part.toBuffer();
            if (part.file.truncated) {
              return reply.code(400).send({
                error: 'O arquivo excede o limite máximo permitido de 5MB por imagem.',
              });
            }
            fileBuffer = buf;
            filename = part.filename;
            mimeType = part.mimetype;
          } else if (part.fieldname === 'notes' && typeof part.value === 'string') {
            notes = part.value;
          }
        }

        if (!fileBuffer) {
          return reply.code(400).send({
            error: 'Arquivo de imagem obrigatório para upload multipart/form-data.',
          });
        }

        const result = await createImageEvidence(
          {
            occurrenceId,
            userId: req.user?.id,
            filename,
            mimeType,
            buffer: fileBuffer,
            notes,
          },
          occurrenceRepository,
          evidenceRepository,
          storageService,
          secretDetector,
          diagnosisRepository,
        );

        return reply.code(201).send(result);
      } catch (err) {
        const errCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';

        if (errCode === 'FST_REQ_FILE_TOO_LARGE' || errCode === 'FST_FILES_LIMIT') {
          return reply.code(400).send({
            error: 'O arquivo excede o limite máximo permitido de 5MB por imagem.',
          });
        }
        if (err instanceof OccurrenceNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        if (err instanceof SensitiveDataDetectedError) {
          // SPEC-08 CA-08: rejeita com HTTP 400 Bad Request e instruções de sanitização sem logar segredos
          return reply.code(400).send({
            error: err.alertMessage,
            guidance: err.securityGuidance,
            fields: err.detectedFields,
          });
        }
        if (err instanceof ImageValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        if (err instanceof StorageProviderError) {
          return reply.code(502).send({ error: err.message });
        }
        if (err instanceof Error) {
          return reply.code(400).send({ error: err.message });
        }
        req.log.error('Erro interno ao processar upload de evidência.');
        return reply.code(500).send({ error: 'Falha ao registrar evidência em foto.' });
      }
    }

    try {
      const body = (req.body ?? {}) as {
        type: EvidenceType;
        method?: HttpMethod;
        url?: string;
        statusCode?: number;
        headers?: Record<string, string>;
        payload?: string;
        body?: string;
        content?: string;
        context?: string;
        notes?: string;
      };

      const result = await createEvidence(
        {
          occurrenceId,
          type: body.type,
          method: body.method,
          url: body.url,
          statusCode: body.statusCode,
          headers: body.headers,
          payload: body.payload,
          body: body.body,
          content: body.content,
          context: body.context,
          notes: body.notes,
        },
        occurrenceRepository,
        evidenceRepository,
        secretDetector,
        diagnosisRepository,
      );

      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof OccurrenceNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof SensitiveDataDetectedError) {
        // RN-13: não loga o conteúdo sensível; retorna HTTP 422 com alerta e orientação (CA-13 / CA-14)
        return reply.code(422).send({
          error: err.alertMessage,
          guidance: err.securityGuidance,
          fields: err.detectedFields,
        });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error('Erro interno ao registrar evidência.');
      return reply.code(500).send({ error: 'Falha ao registrar evidência.' });
    }
  });

  // ------------------------------------------------------------------ //
  // PATCH /occurrences/:occurrenceId/evidences/:evidenceId — Editar evidência (SPEC-03 RF-07, CA-09, CA-13)
  // ------------------------------------------------------------------ //
  app.patch(
    '/occurrences/:occurrenceId/evidences/:evidenceId',
    { preHandler },
    async (req, reply) => {
      const { occurrenceId, evidenceId } = req.params as {
        occurrenceId: string;
        evidenceId: string;
      };
      try {
        const body = (req.body ?? {}) as {
          method?: HttpMethod;
          url?: string;
          statusCode?: number;
          headers?: Record<string, string>;
          payload?: string;
          body?: string;
          content?: string;
          context?: string;
          notes?: string;
        };

        const result = await updateEvidence(
          {
            occurrenceId,
            evidenceId,
            ...body,
          },
          occurrenceRepository,
          evidenceRepository,
          secretDetector,
          diagnosisRepository,
        );

        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof OccurrenceNotFoundError || err instanceof EvidenceNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        if (err instanceof SensitiveDataDetectedError) {
          return reply.code(422).send({
            error: err.alertMessage,
            guidance: err.securityGuidance,
            fields: err.detectedFields,
          });
        }
        if (err instanceof Error) {
          return reply.code(400).send({ error: err.message });
        }
        req.log.error('Erro interno ao editar evidência.');
        return reply.code(500).send({ error: 'Falha ao editar evidência.' });
      }
    },
  );

  // ------------------------------------------------------------------ //
  // DELETE /occurrences/:occurrenceId/evidences/:evidenceId — Remover evidência (SPEC-03 RF-08, SPEC-08 RF-06)
  // ------------------------------------------------------------------ //
  app.delete(
    '/occurrences/:occurrenceId/evidences/:evidenceId',
    { preHandler },
    async (req, reply) => {
      const { occurrenceId, evidenceId } = req.params as {
        occurrenceId: string;
        evidenceId: string;
      };
      const query = (req.query ?? {}) as { confirm?: string };
      const confirmed = query.confirm === 'true';

      try {
        await deleteEvidence(
          {
            occurrenceId,
            evidenceId,
            confirmed,
          },
          occurrenceRepository,
          evidenceRepository,
          diagnosisRepository,
          storageService,
        );

        return reply.code(200).send({ message: 'Evidência excluída definitivamente.' });
      } catch (err) {
        if (err instanceof DeleteConfirmationRequiredError) {
          return reply.code(400).send({
            error: err.message,
            confirmationRequired: true,
          });
        }
        if (err instanceof OccurrenceNotFoundError || err instanceof EvidenceNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        if (err instanceof StorageProviderError) {
          return reply.code(502).send({ error: err.message });
        }
        if (err instanceof Error) {
          return reply.code(400).send({ error: err.message });
        }
        req.log.error('Erro interno ao excluir evidência.');
        return reply.code(500).send({ error: 'Falha ao excluir evidência.' });
      }
    },
  );
};

export default evidenceRoutes;
