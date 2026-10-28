export interface DecodedUserToken {
  uid: string;
  email?: string | null;
  name?: string | null;
  isAnonymous: boolean;
}

export interface ITokenVerifier {
  verifyIdToken(token: string): Promise<DecodedUserToken>;
}
