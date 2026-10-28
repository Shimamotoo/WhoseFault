import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ITokenVerifier, DecodedUserToken } from '../../domain/services/ITokenVerifier.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';

export interface AuthenticatedUser {
  id?: string;
  uid: string;
  email?: string | null;
  name?: string | null;
  isAnonymous: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    userToken?: DecodedUserToken;
  }
}

export function createAuthHook(
  tokenVerifier: ITokenVerifier,
  userRepository?: IUserRepository,
) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Token de autenticação não fornecido ou em formato inválido.',
      });
    }

    const token = authHeader.substring(7).trim();

    try {
      const decoded = await tokenVerifier.verifyIdToken(token);
      request.userToken = decoded;

      let internalId: string | undefined;
      if (userRepository) {
        let existing = await userRepository.findByFirebaseUid(decoded.uid);
        if (!existing) {
          existing = await userRepository.upsert({
            firebaseUid: decoded.uid,
            email: decoded.email ?? null,
            name: decoded.name ?? null,
            isAnonymous: decoded.isAnonymous,
          });
        }
        internalId = existing.id;
      }

      request.user = {
        id: internalId,
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        isAnonymous: decoded.isAnonymous,
      };
    } catch (err) {
      request.log.warn({ err }, 'Falha ao validar token JWT');
      return reply.status(401).send({
        error: 'Token de autenticação inválido ou expirado.',
      });
    }
  };
}
