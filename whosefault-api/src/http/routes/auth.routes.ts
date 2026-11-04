import type { FastifyInstance } from 'fastify';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import type { ITokenVerifier } from '../../domain/services/ITokenVerifier.js';
import type { IOccurrenceRepository } from '../../domain/repositories/IOccurrenceRepository.js';
import { createAuthHook } from '../hooks/authHook.js';
import { syncUser } from '../../application/syncUser.js';
import { mergeGuestAccount } from '../../application/mergeGuestAccount.js';
import { DomainValidationError } from '../../domain/errors.js';

export interface AuthRoutesOptions {
  userRepository: IUserRepository;
  tokenVerifier: ITokenVerifier;
  occurrenceRepository?: IOccurrenceRepository;
}

export default async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { userRepository, tokenVerifier, occurrenceRepository } = options;
  const authenticate = createAuthHook(tokenVerifier, userRepository);

  app.post(
    '/auth/sync',
    { preHandler: authenticate },
    async (request, reply) => {
      if (!request.userToken) {
        return reply.status(401).send({ error: 'Token não autenticado.' });
      }

      const user = await syncUser(
        { tokenUser: request.userToken },
        userRepository,
      );

      return reply.status(200).send({
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        isAnonymous: user.isAnonymous,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    },
  );

  app.post(
    '/auth/merge-guest',
    { preHandler: authenticate },
    async (request, reply) => {
      if (!request.user || !request.user.id) {
        return reply.status(401).send({ error: 'Token não autenticado.' });
      }

      if (request.user.isAnonymous) {
        return reply.status(400).send({ error: 'A conta de destino não pode ser uma conta de visitante.' });
      }

      const body = request.body as { guestToken?: string } | undefined;
      if (!body || typeof body.guestToken !== 'string' || body.guestToken.trim() === '') {
        return reply.status(400).send({ error: 'guestToken é obrigatório.' });
      }

      if (!occurrenceRepository) {
        request.log.error('occurrenceRepository não fornecido para authRoutes');
        return reply.status(500).send({ error: 'Serviço de ocorrências indisponível.' });
      }

      try {
        const result = await mergeGuestAccount(
          {
            targetUserId: request.user.id,
            guestToken: body.guestToken,
          },
          {
            userRepository,
            occurrenceRepository,
            tokenVerifier,
          },
        );

        return reply.status(200).send({
          success: true,
          transferredCount: result.transferredCount,
        });
      } catch (err) {
        if (err instanceof DomainValidationError) {
          return reply.status(400).send({ error: err.message });
        }
        request.log.error(
          { errName: err instanceof Error ? err.name : 'UnknownError' },
          'Falha ao mesclar conta de visitante',
        );
        return reply.status(500).send({ error: 'Falha interna ao mesclar conta de visitante.' });
      }
    },
  );
}
