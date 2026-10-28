import type { ITokenVerifier, DecodedUserToken } from '../../domain/services/ITokenVerifier.js';

export class StubTokenVerifier implements ITokenVerifier {
  private defaultUser: DecodedUserToken;

  constructor(defaultUser?: Partial<DecodedUserToken>) {
    this.defaultUser = {
      uid: defaultUser?.uid ?? 'stub-user-uid',
      email: defaultUser?.email ?? 'dev@whosefault.internal',
      name: defaultUser?.name ?? 'Developer',
      isAnonymous: defaultUser?.isAnonymous ?? false,
    };
  }

  async verifyIdToken(token: string): Promise<DecodedUserToken> {
    if (!token || token.trim() === '' || token === 'invalid-token') {
      throw new Error('Token inválido ou expirado.');
    }

    if (token === 'anonymous-token') {
      return {
        uid: 'stub-guest-uid',
        email: null,
        name: 'Visitante',
        isAnonymous: true,
      };
    }

    return this.defaultUser;
  }
}
