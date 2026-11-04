import type { ITokenVerifier, DecodedUserToken } from '../../domain/services/ITokenVerifier.js';

export class StubTokenVerifier implements ITokenVerifier {
  private defaultUser: DecodedUserToken;
  private tokenMap = new Map<string, DecodedUserToken>();

  constructor(defaultUser?: Partial<DecodedUserToken>) {
    this.defaultUser = {
      uid: defaultUser?.uid ?? 'stub-user-uid',
      email: defaultUser?.email ?? 'dev@whosefault.internal',
      name: defaultUser?.name ?? 'Developer',
      isAnonymous: defaultUser?.isAnonymous ?? false,
    };
  }

  registerToken(token: string, user: DecodedUserToken): void {
    this.tokenMap.set(token, user);
  }

  async verifyIdToken(token: string): Promise<DecodedUserToken> {
    if (!token || token.trim() === '' || token === 'invalid-token') {
      throw new Error('Token inválido ou expirado.');
    }

    if (this.tokenMap.has(token)) {
      return this.tokenMap.get(token)!;
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
