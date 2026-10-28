import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../../src/http/server.js';
import { InMemoryUserRepository } from '../../src/infra/repositories/userRepository.js';
import { InMemoryOccurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import { StubTokenVerifier } from '../../src/infra/auth/stubTokenVerifier.js';
import { cleanupExpiredGuests } from '../../src/application/cleanupGuests.js';
import { User } from '../../src/domain/user.js';

describe('SPEC-06 — Gerenciar Identidade e Autenticação', () => {
  let userRepo: InMemoryUserRepository;
  let occurrenceRepo: InMemoryOccurrenceRepository;
  let tokenVerifier: StubTokenVerifier;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    occurrenceRepo = new InMemoryOccurrenceRepository();
    tokenVerifier = new StubTokenVerifier();

    app = createServer({
      userRepository: userRepo,
      occurrenceRepository: occurrenceRepo,
      tokenVerifier,
      requireAuth: true,
    });
  });

  // ------------------------------------------------------------------ //
  // CA-01: Sincronização de usuário Google
  // ------------------------------------------------------------------ //
  it('CA-01: deve sincronizar com sucesso um usuário autenticado com Google (is_anonymous = false)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sync',
      headers: {
        authorization: 'Bearer valid-google-token',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.firebaseUid).toBe('stub-user-uid');
    expect(body.isAnonymous).toBe(false);
    expect(body.email).toBe('dev@whosefault.internal');
  });

  // ------------------------------------------------------------------ //
  // CA-02: Sincronização de usuário Visitante
  // ------------------------------------------------------------------ //
  it('CA-02: deve registrar o visitante com a flag is_anonymous = true', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sync',
      headers: {
        authorization: 'Bearer anonymous-token',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.firebaseUid).toBe('stub-guest-uid');
    expect(body.isAnonymous).toBe(true);
    expect(body.name).toBe('Visitante');
  });

  // ------------------------------------------------------------------ //
  // CA-03: Promoção de Visitante para Google (Account Linking)
  // ------------------------------------------------------------------ //
  it('CA-03: deve atualizar is_anonymous para false ao promover conta de visitante mantendo o mesmo firebase_uid', async () => {
    // 1. Visitante acessa e sincroniza
    await userRepo.upsert({
      firebaseUid: 'promoted-uid',
      name: 'Visitante Inicial',
      isAnonymous: true,
    });

    // 2. Mock token verifier simula a credencial vinculada (mesmo UID, agora Google)
    const promotedVerifier = new StubTokenVerifier({
      uid: 'promoted-uid',
      email: 'promovido@empresa.com',
      name: 'Dev Promovido',
      isAnonymous: false,
    });

    const customApp = createServer({
      userRepository: userRepo,
      occurrenceRepository: occurrenceRepo,
      tokenVerifier: promotedVerifier,
      requireAuth: true,
    });

    const response = await customApp.inject({
      method: 'POST',
      url: '/api/auth/sync',
      headers: {
        authorization: 'Bearer token-promovido',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.firebaseUid).toBe('promoted-uid');
    expect(body.isAnonymous).toBe(false);
    expect(body.email).toBe('promovido@empresa.com');

    // Verifica no repositório se continua sendo o mesmo registro
    const stored = await userRepo.findByFirebaseUid('promoted-uid');
    expect(stored?.isAnonymous).toBe(false);
  });

  // ------------------------------------------------------------------ //
  // CA-04: Isolamento de ocorrências entre usuários
  // ------------------------------------------------------------------ //
  it('CA-04: deve isolar ocorrências de forma que o Usuário A só veja as suas próprias ocorrências', async () => {
    // Cria User A e User B
    const userA = await userRepo.upsert({
      firebaseUid: 'uid-a',
      name: 'User A',
      isAnonymous: false,
    });
    const userB = await userRepo.upsert({
      firebaseUid: 'uid-b',
      name: 'User B',
      isAnonymous: false,
    });

    // App configurado como User A
    const appA = createServer({
      userRepository: userRepo,
      occurrenceRepository: occurrenceRepo,
      tokenVerifier: new StubTokenVerifier({ uid: 'uid-a' }),
      requireAuth: true,
    });

    // App configurado como User B
    const appB = createServer({
      userRepository: userRepo,
      occurrenceRepository: occurrenceRepo,
      tokenVerifier: new StubTokenVerifier({ uid: 'uid-b' }),
      requireAuth: true,
    });

    // User A cria ocorrência
    await appA.inject({
      method: 'POST',
      url: '/api/occurrences',
      headers: { authorization: 'Bearer token-a' },
      body: {
        apiName: 'API Privada User A',
        url: 'https://api.empresa.com/privado',
        method: 'POST',
      },
    });

    // User B lista ocorrências
    const listResB = await appB.inject({
      method: 'GET',
      url: '/api/occurrences',
      headers: { authorization: 'Bearer token-b' },
    });

    const listB = JSON.parse(listResB.body);
    expect(listB.occurrences).toEqual([]);

    // User A lista ocorrências e encontra a sua
    const listResA = await appA.inject({
      method: 'GET',
      url: '/api/occurrences',
      headers: { authorization: 'Bearer token-a' },
    });
    const listA = JSON.parse(listResA.body);
    expect(listA.occurrences.length).toBe(1);
    expect(listA.occurrences[0].apiName).toBe('API Privada User A');
  });

  // ------------------------------------------------------------------ //
  // CA-05: Rejeição de requisições não autenticadas
  // ------------------------------------------------------------------ //
  it('CA-05: deve rejeitar requisição com HTTP 401 quando o token não for enviado ou for inválido', async () => {
    const semToken = await app.inject({
      method: 'GET',
      url: '/api/occurrences',
    });
    expect(semToken.statusCode).toBe(401);

    const tokenInvalido = await app.inject({
      method: 'GET',
      url: '/api/occurrences',
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(tokenInvalido.statusCode).toBe(401);
  });

  // ------------------------------------------------------------------ //
  // CA-06: Expurgo em lote após 30 dias de inatividade
  // ------------------------------------------------------------------ //
  it('CA-06: deve remover contas de convidados inativas há mais de 30 dias', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    // Convidado inativo > 30 dias
    const expiredGuest = User.create({
      id: 'expired-1',
      firebaseUid: 'firebase-expired-1',
      name: 'Visitante Antigo',
      isAnonymous: true,
      updatedAt: thirtyOneDaysAgo,
    });
    // @ts-expect-error acessando store interna para teste
    userRepo.users.set(expiredGuest.id, expiredGuest);

    // Convidado recente (10 dias)
    const recentGuest = User.create({
      id: 'recent-1',
      firebaseUid: 'firebase-recent-1',
      name: 'Visitante Novo',
      isAnonymous: true,
      updatedAt: tenDaysAgo,
    });
    // @ts-expect-error acessando store interna para teste
    userRepo.users.set(recentGuest.id, recentGuest);

    // Usuário Google antigo (não deve ser expurgado mesmo inativo)
    const regularUser = User.create({
      id: 'regular-1',
      firebaseUid: 'firebase-regular-1',
      name: 'Google User',
      isAnonymous: false,
      updatedAt: thirtyOneDaysAgo,
    });
    // @ts-expect-error acessando store interna para teste
    userRepo.users.set(regularUser.id, regularUser);

    const result = await cleanupExpiredGuests(userRepo, {
      daysInactive: 30,
      deleteFromFirebase: false,
    });

    expect(result.deletedCount).toBe(1);
    expect(await userRepo.findById('expired-1')).toBeNull();
    expect(await userRepo.findById('recent-1')).not.toBeNull();
    expect(await userRepo.findById('regular-1')).not.toBeNull();
  });
});
