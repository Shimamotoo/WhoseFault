import type { FastifyInstance } from 'fastify';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import type { ITokenVerifier } from '../../domain/services/ITokenVerifier.js';
import { createAuthHook } from '../hooks/authHook.js';
import { syncUser } from '../../application/syncUser.js';

export interface AuthRoutesOptions {
  userRepository: IUserRepository;
  tokenVerifier: ITokenVerifier;
}

export default async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { userRepository, tokenVerifier } = options;
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
}
