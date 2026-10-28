import type { IUserRepository } from '../domain/repositories/IUserRepository.js';
import type { DecodedUserToken } from '../domain/services/ITokenVerifier.js';
import type { User } from '../domain/user.js';

export interface ISyncUserInput {
  tokenUser: DecodedUserToken;
}

export async function syncUser(
  input: ISyncUserInput,
  userRepo: IUserRepository,
): Promise<User> {
  const { uid, email, name, isAnonymous } = input.tokenUser;

  const user = await userRepo.upsert({
    firebaseUid: uid,
    email: email ?? null,
    name: name ?? null,
    isAnonymous,
  });

  return user;
}
