import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { initializeAppMock, getAppsMock, certMock } = vi.hoisted(() => ({
  initializeAppMock: vi.fn(),
  getAppsMock: vi.fn(),
  certMock: vi.fn((params: unknown) => ({ __cert: params })),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: initializeAppMock,
  getApps: getAppsMock,
  cert: certMock,
}));

import { ensureFirebaseAdminInitialized } from '../../infra/auth/firebaseTokenVerifier.js';

describe('PA-06: ensureFirebaseAdminInitialized', () => {
  const ENV_KEYS = [
    'FIREBASE_PROJECT_ID',
    'GOOGLE_CLOUD_PROJECT',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ] as const;
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    initializeAppMock.mockReset();
    getAppsMock.mockReset();
    certMock.mockClear();
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('deve inicializar com credenciais de conta de serviço quando FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY existirem', () => {
    getAppsMock.mockReturnValue([]);
    process.env.FIREBASE_PROJECT_ID = 'whosefault-test';
    process.env.FIREBASE_CLIENT_EMAIL = 'svc@whosefault-test.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----';

    ensureFirebaseAdminInitialized();

    expect(certMock).toHaveBeenCalledWith({
      projectId: 'whosefault-test',
      clientEmail: 'svc@whosefault-test.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
    });
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock.mock.calls[0]?.[0]).toMatchObject({
      projectId: 'whosefault-test',
      credential: expect.anything(),
    });
  });

  it('deve inicializar apenas com projectId quando não houver credenciais de conta de serviço', () => {
    getAppsMock.mockReturnValue([]);
    process.env.FIREBASE_PROJECT_ID = 'whosefault-test';

    ensureFirebaseAdminInitialized();

    expect(certMock).not.toHaveBeenCalled();
    expect(initializeAppMock).toHaveBeenCalledWith({ projectId: 'whosefault-test' });
  });

  it('deve ser idempotente e não reinicializar quando já existir um app Firebase', () => {
    getAppsMock.mockReturnValue([{ name: '[DEFAULT]' }]);

    ensureFirebaseAdminInitialized();

    expect(initializeAppMock).not.toHaveBeenCalled();
  });
});
