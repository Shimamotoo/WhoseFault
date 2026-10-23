import type { FastifyPluginAsync } from 'fastify';
import { createEvidence } from '../../application/createEvidence.js';
import { listEvidences } from '../../application/listEvidences.js';
import { updateEvidence, EvidenceNotFoundError } from '../../application/updateEvidence.js';
import {
  deleteEvidence,
  DeleteConfirmationRequiredError,
} from '../../application/deleteEvidence.js';
import { OccurrenceNotFoundError } from '../../application/updateOccurrence.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../../domain/repositories/IEvidenceRepository.js';
import {
  SensitiveDataDetectedError,
  type ISecretDetector,
} from '../../domain/services/ISecretDetector.js';
import { defaultSecretDetector } from '../../domain/services/secretDetector.js';
import type { EvidenceType } from '../../domain/evidence.js';
import type { HttpMethod } from '../../domain/occurrence.js';

export interface EvidenceRoutesOptions {
  occurrenceRepository: IOccurrenceRepository;
  evidenceRepository: IEvidenceRepository;
  secretDetector?: ISecretDetector;
}

/** Rotas referentes ao gerenciamento de evidências (SPEC-03) */
const evidenceRoutes: FastifyPluginAsync<EvidenceRoutesOptions> = async (app, opts) => {
  const { occurrenceRepository, evidenceRepository } = opts;
  const secretDetector = opts.secretDetector ?? defaultSecretDetector;

  // Bloqueio explícito de multipart/upload de arquivos na V1 (RF-12 / RN-15 / CA-17)
  app.addContentTypeParser('multipart/form-data', (_req, _payload, done) => {
    done(
      new Error('O sistema aceita somente conteúdo textual. Upload de arquivos não é permitido na V1.'),
    );
  });

  // ------------------------------------------------------------------ //
  // GET /occurrences/:occurrenceId/evidences — Consultar evidências (SPEC-03 RF-06, CA-08)
  // ------------------------------------------------------------------ //
  app.get('/occurrences/:occurrenceId/evidences', async (req, reply) => {
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
  // POST /occurrences/:occurrenceId/evidences — Registrar evidência (SPEC-03 CA-01 a CA-07, CA-13, CA-14, CA-16, CA-17)
  // ------------------------------------------------------------------ //
  app.post('/occurrences/:occurrenceId/evidences', async (req, reply) => {
    const { occurrenceId } = req.params as { occurrenceId: string };
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
  app.patch('/occurrences/:occurrenceId/evidences/:evidenceId', async (req, reply) => {
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
  });

  // ------------------------------------------------------------------ //
  // DELETE /occurrences/:occurrenceId/evidences/:evidenceId — Remover evidência (SPEC-03 RF-08, CA-10 a CA-12)
  // ------------------------------------------------------------------ //
  app.delete('/occurrences/:occurrenceId/evidences/:evidenceId', async (req, reply) => {
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
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error('Erro interno ao excluir evidência.');
      return reply.code(500).send({ error: 'Falha ao excluir evidência.' });
    }
  });
};

export default evidenceRoutes;
