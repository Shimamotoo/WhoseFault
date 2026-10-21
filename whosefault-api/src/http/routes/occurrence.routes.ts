import { FastifyPluginAsync } from 'fastify';
import { listOccurrences } from '../../application/listOccurrences.js';
import { occurrenceRepository } from '../../infra/repositories/occurrenceRepository.js';

/** Rotas referentes a ocorrências */
const occurrenceRoutes: FastifyPluginAsync = async (app) => {
  // Listar ocorrências
  app.get('/occurrences', async (req, reply) => {
    try {
      const result = await listOccurrences(occurrenceRepository);
      if (result.length === 0) {
        return reply.code(200).send({
          message: 'Nenhuma ocorrência cadastrada.',
          occurrences: [],
        });
      }
      return reply.code(200).send({ occurrences: result });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Falha ao listar ocorrências' });
    }
  });

  // Detalhar ocorrência por id
  app.get('/occurrences/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const occ = await occurrenceRepository.findById(id);
    if (!occ) {
      return reply.code(404).send({ error: 'Ocorrência não encontrada' });
    }
    return reply.code(200).send({
      id: occ.id,
      apiName: occ.apiName,
      method: occ.method,
      url: occ.url,
      title: occ.title ?? 'Ocorrência sem descrição',
      createdAt: occ.createdAt,
      // demais campos da SPEC‑01 (payload, evidências, etc.) podem ser incluídos aqui
    });
  });
};

export default occurrenceRoutes;
