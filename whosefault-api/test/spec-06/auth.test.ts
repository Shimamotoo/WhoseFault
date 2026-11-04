import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../../src/http/server.js';
import { InMemoryUserRepository } from '../../src/infra/repositories/userRepository.js';
import { InMemoryOccurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import { InMemoryEvidenceRepository } from '../../src/infra/repositories/evidenceRepository.js';
import { InMemoryDiagnosisRepository } from '../../src/infra/repositories/diagnosisRepository.js';
import { StubTokenVerifier } from '../../src/infra/auth/stubTokenVerifier.js';
import { StubDiagnosisGenerator } from '../../src/infra/ai/stubDiagnosisGenerator.js';
import { StubTitleGenerator } from '../../src/infra/ai/stubTitleGenerator.js';
import { cleanupExpiredGuests } from '../../src/application/cleanupGuests.js';
import { User } from '../../src/domain/user.js';
import { Occurrence } from '../../src/domain/occurrence.js';
import { Evidence } from '../../src/domain/evidence.js';
import { StubStorageService } from '../../src/infra/storage/stubStorageService.js';

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

  // ------------------------------------------------------------------ //
  // PA-01: Autenticação obrigatória por padrão
  // ------------------------------------------------------------------ //
  it('PA-01: deve exigir autenticação por padrão quando requireAuth não for informado', async () => {
    const defaultAuthApp = createServer({
      userRepository: userRepo,
      occurrenceRepository: occurrenceRepo,
      tokenVerifier,
    });

    const res = await defaultAuthApp.inject({
      method: 'GET',
      url: '/api/occurrences',
    });
    expect(res.statusCode).toBe(401);
  });

  // ------------------------------------------------------------------ //
  // PA-02: Anti-IDOR e Verificação Centralizada de Propriedade
  // ------------------------------------------------------------------ //
  describe('PA-02: Anti-IDOR e Isolamento de Propriedade de Ocorrências, Evidências e Diagnósticos', () => {
    it('deve retornar 404 quando User B tentar acessar, editar, gerar diagnóstico ou excluir ocorrência e evidência de User A', async () => {
      const evidenceRepo = new InMemoryEvidenceRepository();
      const diagnosisRepo = new InMemoryDiagnosisRepository();
      const diagnosisGenerator = new StubDiagnosisGenerator();
      const titleGenerator = new StubTitleGenerator();

      // Setup app para User A
      const tokenVerifierA = new StubTokenVerifier({ uid: 'uid-user-a' });
      const appUserA = createServer({
        userRepository: userRepo,
        occurrenceRepository: occurrenceRepo,
        evidenceRepository: evidenceRepo,
        diagnosisRepository: diagnosisRepo,
        diagnosisGenerator,
        titleGenerator,
        tokenVerifier: tokenVerifierA,
      });

      // Setup app para User B
      const tokenVerifierB = new StubTokenVerifier({ uid: 'uid-user-b' });
      const appUserB = createServer({
        userRepository: userRepo,
        occurrenceRepository: occurrenceRepo,
        evidenceRepository: evidenceRepo,
        diagnosisRepository: diagnosisRepo,
        diagnosisGenerator,
        titleGenerator,
        tokenVerifier: tokenVerifierB,
      });

      // 1. User A cria ocorrência
      const createOccRes = await appUserA.inject({
        method: 'POST',
        url: '/api/occurrences',
        headers: { authorization: 'Bearer token-a' },
        payload: {
          apiName: 'API Confidencial A',
          url: 'https://api.empresa.com/privado',
          method: 'GET',
          description: 'Descrição original A',
        },
      });
      expect(createOccRes.statusCode).toBe(201);
      const occA = JSON.parse(createOccRes.body);

      // 2. User A cria evidência
      const createEvRes = await appUserA.inject({
        method: 'POST',
        url: `/api/occurrences/${occA.id}/evidences`,
        headers: { authorization: 'Bearer token-a' },
        payload: {
          type: 'MANUAL_NOTE',
          content: 'Evidência restrita do User A',
        },
      });
      expect(createEvRes.statusCode).toBe(201);
      const evA = JSON.parse(createEvRes.body);

      // 3. User B tenta GET /occurrences/:id -> 404
      const getOccB = await appUserB.inject({
        method: 'GET',
        url: `/api/occurrences/${occA.id}`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(getOccB.statusCode).toBe(404);

      // 4. User B tenta PATCH /occurrences/:id -> 404
      const patchOccB = await appUserB.inject({
        method: 'PATCH',
        url: `/api/occurrences/${occA.id}`,
        headers: { authorization: 'Bearer token-b' },
        payload: { apiName: 'Hack Name' },
      });
      expect(patchOccB.statusCode).toBe(404);

      // 5. User B tenta POST /occurrences/:id/retry-title -> 404
      const retryTitleB = await appUserB.inject({
        method: 'POST',
        url: `/api/occurrences/${occA.id}/retry-title`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(retryTitleB.statusCode).toBe(404);

      // 6. User B tenta GET /occurrences/:id/evidences -> 404
      const listEvB = await appUserB.inject({
        method: 'GET',
        url: `/api/occurrences/${occA.id}/evidences`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(listEvB.statusCode).toBe(404);

      // 7. User B tenta POST /occurrences/:id/evidences -> 404
      const postEvB = await appUserB.inject({
        method: 'POST',
        url: `/api/occurrences/${occA.id}/evidences`,
        headers: { authorization: 'Bearer token-b' },
        payload: {
          type: 'MANUAL_NOTE',
          content: 'Intruso tentando anexar evidência',
        },
      });
      expect(postEvB.statusCode).toBe(404);

      // 8. User B tenta PATCH /occurrences/:id/evidences/:evId -> 404
      const patchEvB = await appUserB.inject({
        method: 'PATCH',
        url: `/api/occurrences/${occA.id}/evidences/${evA.id}`,
        headers: { authorization: 'Bearer token-b' },
        payload: { content: 'Intruso editando' },
      });
      expect(patchEvB.statusCode).toBe(404);

      // 9. User B tenta DELETE /occurrences/:id/evidences/:evId -> 404
      const delEvB = await appUserB.inject({
        method: 'DELETE',
        url: `/api/occurrences/${occA.id}/evidences/${evA.id}?confirm=true`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(delEvB.statusCode).toBe(404);

      // 10. User B tenta POST /occurrences/:id/diagnosis -> 404
      const postDiagB = await appUserB.inject({
        method: 'POST',
        url: `/api/occurrences/${occA.id}/diagnosis`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(postDiagB.statusCode).toBe(404);

      // 11. User B tenta GET /occurrences/:id/diagnosis -> 404
      const getDiagB = await appUserB.inject({
        method: 'GET',
        url: `/api/occurrences/${occA.id}/diagnosis`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(getDiagB.statusCode).toBe(404);

      // 12. User B tenta DELETE /occurrences/:id -> 404
      const delOccB = await appUserB.inject({
        method: 'DELETE',
        url: `/api/occurrences/${occA.id}`,
        headers: { authorization: 'Bearer token-b' },
      });
      expect(delOccB.statusCode).toBe(404);

      // 13. Confirma que a ocorrência do User A continua intacta
      const getOccA = await appUserA.inject({
        method: 'GET',
        url: `/api/occurrences/${occA.id}`,
        headers: { authorization: 'Bearer token-a' },
      });
      expect(getOccA.statusCode).toBe(200);
    });

    it('deve retornar 401 quando requisição sem autenticação tentar acessar ocorrência pertencente a um usuário', async () => {
      const tokenVerifierA = new StubTokenVerifier({ uid: 'uid-user-a' });
      const openApp = createServer({
        userRepository: userRepo,
        occurrenceRepository: occurrenceRepo,
        tokenVerifier: tokenVerifierA,
        requireAuth: false, // simula chamada onde token não foi enviado mas rota verifica ownership
      });

      // Cria ocorrência pertencente a User A diretamente no repo
      const occ = (await import('../../src/domain/occurrence.js')).Occurrence.create({
        apiName: 'API A',
        url: 'https://api.exemplo.com/test',
        method: 'GET',
        userId: 'some-user-id',
      });
      await occurrenceRepo.save(occ);

      const unauthGet = await openApp.inject({
        method: 'GET',
        url: `/api/occurrences/${occ.id}`,
      });
      expect(unauthGet.statusCode).toBe(401);
    });
  });

  // ------------------------------------------------------------------ //
  // PA-10: Tratamento global de erros 4xx Fastify
  // ------------------------------------------------------------------ //
  describe('PA-10: Tratamento global de erros 4xx Fastify', () => {
    it('deve retornar HTTP 400 ao receber JSON malformado', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/occurrences',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: '{"apiName": "invalido", ',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Requisição inválida ou payload JSON malformado.');
    });
  });

  // ------------------------------------------------------------------ //
  // PA-04: Restrição de HTTP 400 a DomainValidationError e ocultação de erros internos
  // ------------------------------------------------------------------ //
  describe('PA-04: Restrição de HTTP 400 a DomainValidationError e ocultação de erros internos', () => {
    it('deve retornar HTTP 500 sem expor a mensagem interna quando ocorrer erro inesperado no repositório', async () => {
      const failingRepo = {
        findAll: vi.fn(),
        findById: vi.fn().mockRejectedValue(new Error('PrismaClientKnownRequestError: connection pool timeout at line 42')),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };

      const failingApp = createServer({
        userRepository: userRepo,
        occurrenceRepository: failingRepo,
        tokenVerifier,
        requireAuth: false,
      });

      const res = await failingApp.inject({
        method: 'GET',
        url: '/api/occurrences/some-id',
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Falha ao buscar ocorrência.');
      expect(JSON.stringify(body)).not.toContain('PrismaClientKnownRequestError');
    });
  });

  // ------------------------------------------------------------------ //
  // PA-07: Expurgo das imagens no storage antes da cascata do banco
  // ------------------------------------------------------------------ //
  describe('PA-07: Remoção de imagens do storage no expurgo de visitantes', () => {
    async function seedGuestWithImage(params: {
      userId: string;
      firebaseUid: string;
      updatedAt: Date;
      evidenceRepo: InMemoryEvidenceRepository;
      storage: StubStorageService;
    }): Promise<string> {
      const guest = User.create({
        id: params.userId,
        firebaseUid: params.firebaseUid,
        name: 'Visitante',
        isAnonymous: true,
        updatedAt: params.updatedAt,
      });
      // @ts-expect-error acessando store interna para teste
      userRepo.users.set(guest.id, guest);

      const occurrence = Occurrence.create({
        userId: params.userId,
        apiName: 'API Visitante',
        url: 'https://api.exemplo.com/visitante',
        method: 'GET',
      });
      await occurrenceRepo.save(occurrence);

      const uploaded = await params.storage.uploadFile({
        occurrenceId: occurrence.id,
        filename: 'print.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-png'),
      });

      await params.evidenceRepo.save(
        Evidence.create({
          occurrenceId: occurrence.id,
          type: 'IMAGE',
          url: uploaded.storagePath,
          headers: { contentType: 'image/png', sizeBytes: '8' },
        }),
      );
      await params.evidenceRepo.save(
        Evidence.create({
          occurrenceId: occurrence.id,
          type: 'MANUAL_NOTE',
          content: 'Nota textual sem arquivo físico',
        }),
      );

      return uploaded.storagePath;
    }

    it('deve apagar do storage as imagens de visitantes expirados e preservar as de visitantes ativos', async () => {
      const evidenceRepo = new InMemoryEvidenceRepository();
      const storage = new StubStorageService();

      const expiredPath = await seedGuestWithImage({
        userId: 'expired-guest',
        firebaseUid: 'firebase-expired-guest',
        updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        evidenceRepo,
        storage,
      });
      const activePath = await seedGuestWithImage({
        userId: 'active-guest',
        firebaseUid: 'firebase-active-guest',
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        evidenceRepo,
        storage,
      });

      const result = await cleanupExpiredGuests(userRepo, {
        daysInactive: 30,
        deleteFromFirebase: false,
        occurrenceRepo,
        evidenceRepo,
        storageService: storage,
      });

      expect(result.deletedCount).toBe(1);
      expect(result.storageDeletedCount).toBe(1);
      expect(result.storageErrors).toEqual([]);
      expect(storage.hasFile(expiredPath)).toBe(false);
      expect(storage.hasFile(activePath)).toBe(true);
      expect(await userRepo.findById('expired-guest')).toBeNull();
      expect(await userRepo.findById('active-guest')).not.toBeNull();
    });

    it('deve continuar o expurgo do banco e reportar storageErrors quando a remoção de um arquivo falhar', async () => {
      const evidenceRepo = new InMemoryEvidenceRepository();
      const storage = new StubStorageService();

      await seedGuestWithImage({
        userId: 'expired-guest-fail',
        firebaseUid: 'firebase-expired-guest-fail',
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        evidenceRepo,
        storage,
      });

      vi.spyOn(storage, 'deleteFile').mockRejectedValueOnce(new Error('GCS indisponível'));

      const result = await cleanupExpiredGuests(userRepo, {
        daysInactive: 30,
        deleteFromFirebase: false,
        occurrenceRepo,
        evidenceRepo,
        storageService: storage,
      });

      expect(result.deletedCount).toBe(1);
      expect(result.storageDeletedCount).toBe(0);
      expect(result.storageErrors).toHaveLength(1);
      expect(result.storageErrors[0]).toContain('GCS indisponível');
      expect(await userRepo.findById('expired-guest-fail')).toBeNull();
    });
  });
});
