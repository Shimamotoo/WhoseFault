import type { IUserRepository } from '../domain/repositories/IUserRepository.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { ITokenVerifier } from '../domain/services/ITokenVerifier.js';
import { DomainValidationError } from '../domain/errors.js';

export interface IMergeGuestAccountInput {
  targetUserId: string;
  guestToken: string;
}

export interface IMergeGuestAccountDeps {
  userRepository: IUserRepository;
  occurrenceRepository: IOccurrenceRepository;
  tokenVerifier: ITokenVerifier;
}

export interface IMergeGuestAccountOutput {
  transferredCount: number;
}

/**
 * Mescla os dados de uma sessão de visitante anônimo para uma conta permanente (ex: Google)
 * após autenticação bem-sucedida, transferindo todas as ocorrências e expurgando o registro anônimo.
 */
export async function mergeGuestAccount(
  input: IMergeGuestAccountInput,
  deps: IMergeGuestAccountDeps,
): Promise<IMergeGuestAccountOutput> {
  const { targetUserId, guestToken } = input;
  const { userRepository, occurrenceRepository, tokenVerifier } = deps;

  if (!guestToken || typeof guestToken !== 'string' || guestToken.trim() === '') {
    throw new DomainValidationError('guestToken é obrigatório.');
  }

  const targetUser = await userRepository.findById(targetUserId);
  if (!targetUser) {
    throw new DomainValidationError('Usuário de destino não encontrado.');
  }

  if (targetUser.isAnonymous) {
    throw new DomainValidationError('A conta de destino não pode ser uma conta de visitante.');
  }

  let guestTokenUser;
  try {
    guestTokenUser = await tokenVerifier.verifyIdToken(guestToken.trim());
  } catch {
    throw new DomainValidationError('Token de visitante inválido ou expirado.');
  }

  if (!guestTokenUser.isAnonymous) {
    throw new DomainValidationError('A conta de origem a ser mesclada deve ser anônima.');
  }

  if (guestTokenUser.uid === targetUser.firebaseUid) {
    return { transferredCount: 0 };
  }

  const guestUser = await userRepository.findByFirebaseUid(guestTokenUser.uid);
  if (!guestUser || guestUser.id === targetUser.id) {
    return { transferredCount: 0 };
  }

  const transferredCount = await occurrenceRepository.transferOwnership(
    guestUser.id,
    targetUser.id,
  );

  await userRepository.deleteMany([guestUser.id]);

  return { transferredCount };
}
