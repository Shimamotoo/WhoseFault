import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { ITokenVerifier, DecodedUserToken } from '../../domain/services/ITokenVerifier.js';

/**
 * Inicializa (uma única vez por processo) o app padrão do Firebase Admin SDK (PA-06).
 *
 * - Com `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`: inicializa com credenciais de conta de serviço,
 *   necessárias para operações administrativas como `getAuth().deleteUsers()` (expurgo de visitantes).
 * - Sem essas variáveis: inicializa apenas com `projectId`, suficiente para `verifyIdToken()`
 *   (valida a assinatura JWT contra as chaves públicas oficiais do Google) ou para uso de ADC.
 *
 * É idempotente: se já existir um app inicializado, não faz nada.
 */
export function ensureFirebaseAdminInitialized(): void {
  if (getApps().length > 0) return;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'whosefault';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    // Para verifyIdToken(), o Firebase Admin precisa apenas do projectId
    // (valida a assinatura JWT contra as chaves públicas oficiais do Google)
    initializeApp({ projectId });
  }
}

export class FirebaseTokenVerifier implements ITokenVerifier {
  private initialized = false;

  private ensureInitialized(): void {
    if (this.initialized) return;
    ensureFirebaseAdminInitialized();
    this.initialized = true;
  }

  async verifyIdToken(token: string): Promise<DecodedUserToken> {
    this.ensureInitialized();
    const decoded = await getAuth().verifyIdToken(token);

    const isAnonymous = decoded.firebase?.sign_in_provider === 'anonymous';

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      isAnonymous,
    };
  }
}
