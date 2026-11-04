# Planos de Ação Progressivos e Individuais — Revisão CodeRabbit

## Objetivo e Estratégia de Execução

Este documento transforma os **17 achados do CodeRabbit** (`10` em `whosefault-api` e `7` em `whosefault-web`) em **17 Planos de Ação modulares (`PA-01` a `PA-17`)**, organizados em **4 Ondas Progressivas**.

Essa estrutura permite dois modos de trabalho à sua escolha:
1. **Execução Progressiva por Ondas:** executar Onda 1 → Onda 2 → Onda 3 → Onda 4, mantendo build e testes verdes ao final de cada etapa.
2. **Execução Individual / Sob Demanda:** executar qualquer `PA-XX` separadamente em PRs ou commits atômicos, respeitando apenas as dependências diretas indicadas no grafo abaixo.

```mermaid
flowchart TD
  subgraph W1["Onda 1: Segurança Crítica, IDOR e Superfície HTTP (API)"]
    PA01["PA-01 [critical] Auth obrigatória por padrão"]
    PA02["PA-02 [major] Guard de Ownership / Anti-IDOR"]
    PA03["PA-03 [major] Blindagem de params vs body no PATCH"]
    PA04["PA-04 [major] DomainValidationError vs HTTP 500"]
    PA10["PA-10 [minor] Preservar erros 4xx no ErrorHandler"]
    PA01 --> PA02
    PA04 --> PA10
  end

  subgraph W2["Onda 2: Integridade de Dados, Domínio e Expurgo (API)"]
    PA05["PA-05 [major] Preservar description no PATCH"]
    PA06["PA-06 [major] Init explícito do Firebase Admin no cleanup"]
    PA07["PA-07 [major] Limpeza de imagens no GCS no cleanup"]
    PA08["PA-08 [minor] Regex de connection strings com credenciais"]
    PA09["PA-09 [minor] Evidence.restore na reidratação Prisma"]
    PA06 --> PA07
  end

  subgraph W3["Onda 3: Sessão, Account Linking e Polling (Web + API)"]
    PA13["PA-13 [minor] Eliminar duplo POST /auth/sync"]
    PA14["PA-14 [minor] signInWithCredential sem 2º pop-up"]
    PA15["PA-15 [minor] Migração/aviso de dados de visitante"]
    PA12["PA-12 [minor] Auto-fechar LoginDialog pós-vínculo"]
    PA11["PA-11 [minor] Token de cancelamento no polling"]
    PA13 --> PA14
    PA14 --> PA15
    PA14 --> PA12
  end

  subgraph W4["Onda 4: UX de Validação e Acessibilidade (Web)"]
    PA16["PA-16 [minor] Acessibilidade por teclado nos Cards"]
    PA17["PA-17 [minor] Alerta de segredo restrito a err.guidance"]
  end
```

---

## User Review Required

> [!CAUTION]
> **Mudança de postura de segurança em `createServer` (`PA-01`):** `requireAuth` passará de `false` para `true` por padrão (*fail-closed*). Os 5 arquivos de teste legados que exercitam rotas HTTP *in-memory* sem cabeçalho `Authorization` (`SPEC-01`, `SPEC-02`, `SPEC-03`, `SPEC-04`, `SPEC-07`) passarão `requireAuth: false` explicitamente no setup de teste, garantindo que nenhum código de produção possa subir desprotegido por omissão.

## Open Questions

> [!IMPORTANT]
> **Decisão de Produto no `PA-15` (`auth/credential-already-in-use` ao vincular visitante a uma conta Google já existente):**
> 1. **Abordagem A (Recomendada — Migração Transparente):** Criar um endpoint autenticado `POST /api/auth/merge-guest` que recebe o `guestIdToken` anterior, valida que era uma conta anônima (`isAnonymous === true`), transfere as ocorrências para a conta Google existente e remove o visitante. Cumpre integralmente a promessa do modal (*"todas as investigações criadas nesta sessão serão salvas"*).
> 2. **Abordagem B (Somente Frontend — Confirmação Explícita):** Reter a credencial retornada por `credentialFromError` e pedir confirmação no `LoginDialog` avisando que a conta Google já existe e que trocar para ela não mesclará as ocorrências da sessão visitante.
>
> **Decisão de Execução:** Você prefere que, após aprovar o plano, executemos **uma onda por vez** (pausando para validação a cada onda) ou **todos os planos sequencialmente** com commits/validações separados?

---

## Proposed Changes — Onda 1: Segurança Crítica, IDOR e Superfície HTTP (`whosefault-api`)

### PA-01 · `[critical]` Autenticação obrigatória por padrão em produção (Achado #1)
* **Dependências:** Nenhuma (primeiro plano recomendado).
* **Escopo:** Fechar o bypass de autenticação quando o header `Authorization` é omitido e impedir listagem global sem `userId` no banco relacional.

#### [MODIFY] [server.ts](file:///c:/WhoseFault/whosefault-api/src/http/server.ts#L78-L123)
Alterar o valor padrão de `requireAuth` para `true`.
```diff
     secretDetector = defaultSecretDetector,
     storageService = new StubStorageService(),
-    requireAuth = false,
+    requireAuth = true,
   } = deps;
```

#### [MODIFY] [index.ts](file:///c:/WhoseFault/whosefault-api/src/index.ts#L23-L28)
Declarar `requireAuth: true` explicitamente na inicialização de produção.
```diff
 const app = createServer({
   titleGenerator: new GeminiTitleGenerator(),
   titleQueue,
   diagnosisGenerator: new GeminiDiagnosisAdapter({ storageService }),
   storageService,
+  requireAuth: true,
 });
```

#### [MODIFY] [prismaOccurrenceRepository.ts](file:///c:/WhoseFault/whosefault-api/src/infra/repositories/prismaOccurrenceRepository.ts#L9-L14)
Impedir que `findAll(undefined)` retorne ocorrências de todos os inquilinos no PostgreSQL (defesa em profundidade).
```diff
   async findAll(userId?: string): Promise<Occurrence[]> {
+    if (!userId) {
+      return [];
+    }
     const records = await this.db.occurrence.findMany({
-      where: userId ? { userId } : undefined,
+      where: { userId },
       orderBy: { createdAt: 'desc' },
     });
```

#### [MODIFY] Testes *in-memory* sem autenticação explícita
Adicionar `requireAuth: false` apenas nos servidores de teste focados em regras de domínio/rotas sem JWT:
- [occurrence.test.ts (SPEC-01)](file:///c:/WhoseFault/whosefault-api/test/spec-01/occurrence.test.ts#L35-L39)
- [occurrence.test.ts (SPEC-02)](file:///c:/WhoseFault/whosefault-api/test/spec-02/occurrence.test.ts#L18-L20)
- [title-queue.test.ts (SPEC-07)](file:///c:/WhoseFault/whosefault-api/test/spec-07/title-queue.test.ts#L57-L61)
- [evidence.routes.test.ts](file:///c:/WhoseFault/whosefault-api/src/tests/http/evidence.routes.test.ts#L12-L15)
- [diagnosis.routes.test.ts](file:///c:/WhoseFault/whosefault-api/src/tests/http/diagnosis.routes.test.ts#L55-L60)
- *(Nota: [image-evidences.test.ts (SPEC-08)](file:///c:/WhoseFault/whosefault-api/test/spec-08/image-evidences.test.ts#L69-L77) já envia Bearer token nas rotas autenticadas e espera `401` na rota sem token).*
- Adicionar teste em [auth.test.ts](file:///c:/WhoseFault/whosefault-api/test/spec-06/auth.test.ts) validando que `createServer()` sem `requireAuth` explícito rejeita requisições sem token com `401`.

* **Validação PA-01:** `npm --prefix whosefault-api run test:unit`
* **Commit sugerido:** `fix(api): enforce authentication by default and prevent cross-tenant listing`

---

### PA-02 · `[major]` Verificação centralizada de propriedade / Anti-IDOR (Achado #2)
* **Dependências:** Recomendado após `PA-01`.
* **Escopo:** Garantir que toda leitura ou mutação de ocorrência, evidência ou diagnóstico verifique se `occurrence.userId` pertence ao `userId` autenticado, retornando `404` quando pertencer a outro usuário (evitando enumeração de UUIDs) e `401` se a ocorrência tiver dono e a requisição não estiver autenticada.

#### [NEW] [occurrenceOwnership.ts](file:///c:/WhoseFault/whosefault-api/src/application/occurrenceOwnership.ts)
Criar helper reutilizável de domínio/aplicação:
```ts
import type { Occurrence } from '../domain/occurrence.js';
import { OccurrenceNotFoundError } from './updateOccurrence.js';

export class UnauthorizedOccurrenceAccessError extends Error {
  constructor() {
    super('Autenticação obrigatória para acessar esta ocorrência.');
    this.name = 'UnauthorizedOccurrenceAccessError';
  }
}

export function assertOccurrenceOwnership(
  occurrence: Occurrence,
  requesterUserId?: string,
): void {
  if (!occurrence.userId) {
    return;
  }
  if (!requesterUserId) {
    throw new UnauthorizedOccurrenceAccessError();
  }
  if (occurrence.userId !== requesterUserId) {
    throw new OccurrenceNotFoundError(occurrence.id);
  }
}
```

#### [MODIFY] Casos de uso e rotas protegidas
Aplicar `assertOccurrenceOwnership(occurrence, userId)` e repassar `req.user?.id` em:
- [occurrence.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/occurrence.routes.ts#L62-L197): `GET /occurrences/:id`, `PATCH /occurrences/:id`, `POST /occurrences/:id/retry-title` e `DELETE /occurrences/:id`.
- [updateOccurrence.ts](file:///c:/WhoseFault/whosefault-api/src/application/updateOccurrence.ts#L10-L55): incluir `userId?: string` em `IUpdateOccurrenceInput` e validar ownership.
- [retryTitleGeneration.ts](file:///c:/WhoseFault/whosefault-api/src/application/retryTitleGeneration.ts#L26-L35): aceitar `userId?: string` e validar ownership antes das pré-condições de título/descrição.
- [deleteOccurrence.ts](file:///c:/WhoseFault/whosefault-api/src/application/deleteOccurrence.ts#L28-L32): substituir o `if` parcial por `assertOccurrenceOwnership(existing, input.userId)`.
- [listEvidences.ts](file:///c:/WhoseFault/whosefault-api/src/application/listEvidences.ts#L9-L20), [createEvidence.ts](file:///c:/WhoseFault/whosefault-api/src/application/createEvidence.ts#L13-L78), [updateEvidence.ts](file:///c:/WhoseFault/whosefault-api/src/application/updateEvidence.ts#L21-L52), [deleteEvidence.ts](file:///c:/WhoseFault/whosefault-api/src/application/deleteEvidence.ts#L20-L48), [createImageEvidence.ts](file:///c:/WhoseFault/whosefault-api/src/application/createImageEvidence.ts#L56-L58) e [getEvidenceImage.ts](file:///c:/WhoseFault/whosefault-api/src/application/getEvidenceImage.ts#L47-L54) + repasse de `userId: req.user?.id` em [evidence.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/evidence.routes.ts).
- [generateDiagnosisUseCase.ts](file:///c:/WhoseFault/whosefault-api/src/application/useCases/generateDiagnosisUseCase.ts#L135-L141) (`execute(occurrenceId, userId?: string)`) e `GET /occurrences/:id/diagnosis` em [diagnosis.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/diagnosis.routes.ts#L59-L135).
- Adicionar suíte de testes multi-inquilino em [auth.test.ts](file:///c:/WhoseFault/whosefault-api/test/spec-06/auth.test.ts) cobrindo tentativas cruzadas (`User B` tentando ler/editar/excluir ocorrência, evidências e diagnóstico de `User A` → `404`).

* **Validação PA-02:** `npm --prefix whosefault-api run test:unit`
* **Commit sugerido:** `fix(api): enforce occurrence ownership checks across occurrence, evidence, and diagnosis routes`

---

### PA-03 · `[major]` Impedir sobrescrita de `occurrenceId` e `evidenceId` via `...body` (Achado #3)
* **Dependências:** Independente.
* **Escopo:** Evitar que propriedades extras no JSON do `PATCH` sobrescrevam os parâmetros de rota.

#### [MODIFY] [evidence.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/evidence.routes.ts#L289-L299)
Mapear explicitamente apenas os campos editáveis permitidos pelo contrato (e `userId` do `PA-02`):
```diff
         const result = await updateEvidence(
           {
             occurrenceId,
             evidenceId,
-            ...body,
+            method: body.method,
+            url: body.url,
+            statusCode: body.statusCode,
+            headers: body.headers,
+            payload: body.payload,
+            body: body.body,
+            content: body.content,
+            context: body.context,
+            notes: body.notes,
           },
           occurrenceRepository,
```
- Adicionar teste em [evidence.routes.test.ts](file:///c:/WhoseFault/whosefault-api/src/tests/http/evidence.routes.test.ts) enviando `occurrenceId` e `evidenceId` divergentes no `payload` do `PATCH` e garantindo que os IDs da URL prevalecem.

* **Validação PA-03:** `npx --prefix whosefault-api vitest run src/tests/http/evidence.routes.test.ts`
* **Commit sugerido:** `fix(api): prevent body spread from overriding route params in updateEvidence`

---

### PA-04 · `[major]` Não converter `Error` genérico de infraestrutura em HTTP `400` (Achado #4)
* **Dependências:** Independente.
* **Escopo:** Criar erro tipado `DomainValidationError` para falhas de regra de negócio/validação (`400`), impedindo que falhas do Prisma/banco caiam em `err instanceof Error` e vazem `err.message` para o cliente em vez de retornar `500`.

#### [NEW] [errors.ts](file:///c:/WhoseFault/whosefault-api/src/domain/errors.ts)
```ts
export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
  }
}
```

#### [MODIFY] Entidades, Casos de Uso e Rotas HTTP
- [occurrence.ts](file:///c:/WhoseFault/whosefault-api/src/domain/occurrence.ts#L58-L85): substituir `throw new Error(...)` de validação por `throw new DomainValidationError(...)`.
- [evidence.ts](file:///c:/WhoseFault/whosefault-api/src/domain/evidence.ts#L51-L270): substituir `throw new Error(...)` de validação em `validateHeaders` e `Evidence.create` por `throw new DomainValidationError(...)`.
- [retryTitleGeneration.ts](file:///c:/WhoseFault/whosefault-api/src/application/retryTitleGeneration.ts#L37-L42): lançar `DomainValidationError` nas pré-condições de descrição/título.
- [occurrence.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/occurrence.routes.ts#L111-L174) e [evidence.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/evidence.routes.ts#L202-L368): trocar `if (err instanceof Error)` por `if (err instanceof DomainValidationError)`, registrando apenas `{ errName: err instanceof Error ? err.name : 'UnknownError' }` em `req.log.error` antes de retornar `500`.
- Adicionar testes simulando rejeição de repositório (`new Error('PrismaClientKnownRequestError: ...')`) e verificando retorno HTTP `500` sem expor a mensagem interna.

* **Validação PA-04:** `npm --prefix whosefault-api run test:unit`
* **Commit sugerido:** `fix(api): restrict HTTP 400 responses to DomainValidationError and hide internal errors`

---

### PA-10 · `[minor]` Preservar status `4xx` nativos do Fastify no error handler global (Achado #10)
* **Dependências:** Recomendado junto ou após `PA-04`.
* **Escopo:** Evitar que JSON malformado (`400`), payload acima do limite (`413`) ou `Content-Type` não suportado (`415`) virem `500 Internal Server Error`.

#### [MODIFY] [server.ts](file:///c:/WhoseFault/whosefault-api/src/http/server.ts#L164-L177)
```diff
     if (error.code?.startsWith('FST_INVALID_MULTIPART')) {
       return reply.status(400).send({
         error: 'Formato multipart/form-data inválido.',
       });
     }
+    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
+      return reply.status(error.statusCode).send({
+        error:
+          error.statusCode === 400
+            ? 'Requisição inválida ou payload JSON malformado.'
+            : error.message || 'Requisição inválida.',
+      });
+    }
     request.log.error({ errName: error.name }, 'Unhandled server error');
     reply.status(500).send({ error: 'Internal Server Error' });
```
- Adicionar teste enviando JSON malformado (`"{invalid"`) com `Content-Type: application/json` e verificando retorno `400`.

* **Validação PA-10:** `npm --prefix whosefault-api run test:unit`
* **Commit sugerido:** `fix(api): preserve Fastify 4xx client error status codes in global error handler`

---

## Proposed Changes — Onda 2: Integridade de Dados, Domínio e Expurgo (`whosefault-api`)

### PA-05 · `[major]` Preservar `description` quando omitida em `PATCH /occurrences/:id` (Achado #5)
* **Dependências:** Independente.
* **Escopo:** Impedir que edições parciais (ex.: alterar apenas `url` ou `method`) apaguem `existing.description` por conta de `{ description: undefined }` na rota.

#### [MODIFY] [updateOccurrence.ts](file:///c:/WhoseFault/whosefault-api/src/application/updateOccurrence.ts#L10-L60)
Permitir `description?: string | null` (onde `undefined` preserva o valor existente e `null`/`""` limpa explicitamente se desejado):
```diff
 export interface IUpdateOccurrenceInput {
   id: string;
   apiName?: string;
   url?: string;
   method?: HttpMethod;
-  description?: string;
+  description?: string | null;
 }
...
   const hadDescription =
     existing.description !== undefined && existing.description.trim() !== '';
   const newDescription =
-    'description' in input ? input.description : existing.description;
+    input.description === undefined
+      ? existing.description
+      : input.description === null || input.description.trim() === ''
+        ? undefined
+        : input.description;
```
- Adicionar caso de teste em [occurrence.test.ts (SPEC-01)](file:///c:/WhoseFault/whosefault-api/test/spec-01/occurrence.test.ts) criando ocorrência com descrição, enviando `PATCH { method: 'PUT' }` sem `description` e validando que a descrição original permanece intacta.

* **Validação PA-05:** `npx --prefix whosefault-api vitest run test/spec-01/occurrence.test.ts`
* **Commit sugerido:** `fix(api): preserve existing occurrence description on partial PATCH`

---

### PA-06 · `[major]` Inicializar Firebase Admin SDK antes do expurgo de visitantes (Achado #6)
* **Dependências:** Independente.
* **Escopo:** Garantir que o script de expurgo inicialize o app Firebase Admin com credenciais de conta de serviço (necessárias para `getAuth().deleteUsers()`), em vez de depender do construtor vazio de `FirebaseTokenVerifier`.

#### [MODIFY] [firebaseTokenVerifier.ts](file:///c:/WhoseFault/whosefault-api/src/infra/auth/firebaseTokenVerifier.ts#L5-L37)
Extrair e exportar `ensureFirebaseAdminInitialized()`:
```ts
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
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    initializeApp({ projectId });
  }
}
```
E reutilizá-lo dentro de `FirebaseTokenVerifier.ensureInitialized()`.

#### [MODIFY] [cleanupGuests.ts (script)](file:///c:/WhoseFault/whosefault-api/src/infra/scripts/cleanupGuests.ts#L1-L11)
Carregar `.env` (`process.loadEnvFile?.()`) e chamar `ensureFirebaseAdminInitialized()` antes de `cleanupExpiredGuests`.

* **Validação PA-06:** `npx --prefix whosefault-api vitest run test/spec-06/auth.test.ts` + `npm --prefix whosefault-api run typecheck`
* **Commit sugerido:** `fix(api): initialize Firebase Admin SDK explicitly in guest cleanup script`

---

### PA-07 · `[major]` Remover imagens do GCS antes de deletar visitantes expirados (Achado #7)
* **Dependências:** Recomendado após `PA-06` (compartilha os mesmos arquivos de `cleanupGuests`).
* **Escopo:** Coletar evidências `IMAGE` pertencentes às ocorrências dos visitantes expirados e excluí-las do bucket via `IStorageService.deleteFile` antes do `userRepo.deleteMany(ids)`.

#### [MODIFY] [cleanupGuests.ts (application)](file:///c:/WhoseFault/whosefault-api/src/application/cleanupGuests.ts)
Estender `cleanupExpiredGuests` com dependências opcionais `{ occurrenceRepo, evidenceRepo, storageService }` e métricas `storageDeletedCount` / `storageErrors`:
```ts
  if (options?.occurrenceRepo && options?.evidenceRepo && options?.storageService) {
    for (const userId of ids) {
      const occurrences = await options.occurrenceRepo.findAll(userId);
      for (const occ of occurrences) {
        const evidences = await options.evidenceRepo.findByOccurrenceId(occ.id);
        for (const ev of evidences) {
          if (ev.type === 'IMAGE' && ev.url) {
            try {
              await options.storageService.deleteFile(ev.url);
              storageDeletedCount++;
            } catch (err) {
              storageErrors.push(`${ev.url}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }
    }
  }
```
#### [MODIFY] [cleanupGuests.ts (script)](file:///c:/WhoseFault/whosefault-api/src/infra/scripts/cleanupGuests.ts)
Injetar `prismaOccurrenceRepository`, `prismaEvidenceRepository` e `new GcsStorageService()` na chamada de `cleanupExpiredGuests`.
- Adicionar teste unitário em [auth.test.ts](file:///c:/WhoseFault/whosefault-api/test/spec-06/auth.test.ts) com `StubStorageService`, validando que imagens de visitantes expirados são apagadas do storage enquanto imagens de visitantes ativos permanecem.

* **Validação PA-07:** `npx --prefix whosefault-api vitest run test/spec-06/auth.test.ts`
* **Commit sugerido:** `fix(api): purge guest image evidences from GCS before cascading user deletion`

---

### PA-08 · `[minor]` Exigir credenciais embutidas na regex de connection strings (Achado #8)
* **Dependências:** Independente.
* **Escopo:** Permitir o registro de logs legítimos contendo URIs de serviço sem credenciais (ex.: `redis://localhost:6379` ou `mongodb://mongo-internal:27017/app`), mantendo o bloqueio quando houver `user:password@` (ou senha não mascarada).

#### [MODIFY] [secretDetector.ts](file:///c:/WhoseFault/whosefault-api/src/domain/services/secretDetector.ts#L43-L47)
```diff
   // Credenciais embutidas em URLs (ex: https://user:password@host)
   /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:(?!\*+@|\[REDACTED\]@)[^/\s@]+@[^/\s]+/i,
-  // Strings de conexão de banco/serviços com credenciais (postgres://, mongodb://, redis://, amqp://, mysql://)
-  /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis|rediss|mysql|amqp|amqps):\/\/[^\s]+/i,
+  // Strings de conexão de banco/serviços com credenciais (ex: postgres://user:pass@host ou redis://:pass@host)
+  /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis|rediss|mysql|amqp|amqps):\/\/[^/\s:@]*:(?!\*+@|\[?(?:REDACTED|MASKED|OCULTO)\]?@|<[^>]+>@)[^/\s@]+@[^\s]+/i,
```
*(Observação: `[^/\s:@]*:` cobre também o formato `redis://:senha@host:6379`, onde o usuário é vazio mas a senha está presente!)*
- Atualizar [secretDetector.test.ts](file:///c:/WhoseFault/whosefault-api/src/tests/domain/secretDetector.test.ts) testando:
  - `redis://localhost:6379` e `postgres://db.internal:5432/app` → **permitidos**;
  - `postgres://dbuser:dbpass123@localhost:5432/prod` e `redis://:mysecret@localhost:6379` → **bloqueados**;
  - `postgres://dbuser:***@localhost:5432/prod` → **permitido**.

* **Validação PA-08:** `npx --prefix whosefault-api vitest run src/tests/domain/secretDetector.test.ts`
* **Commit sugerido:** `fix(api): allow credential-free connection URIs in PatternSecretDetector`

---

### PA-09 · `[minor]` Separar reidratação (`Evidence.restore`) da validação de criação (Achado #9)
* **Dependências:** Independente.
* **Escopo:** Evitar que `PrismaEvidenceRepository.mapRecordToDomain` execute `PatternSecretDetector` e bloqueie leitura/exclusão de registros já persistidos caso regras de detecção evoluam.

#### [MODIFY] [evidence.ts](file:///c:/WhoseFault/whosefault-api/src/domain/evidence.ts#L125-L318)
Adicionar método estático `Evidence.restore(props)` que instancia `new Evidence(...)` diretamente a partir dos dados já persistidos no banco, sem reexecutar `secretDetector.assertNoSecrets` nem validações de entrada de formulário. *(O double-check de segurança antes do envio à IA permanece ativo em [prepareEvidencesForAI.ts](file:///c:/WhoseFault/whosefault-api/src/application/prepareEvidencesForAI.ts) e [generateDiagnosisUseCase.ts](file:///c:/WhoseFault/whosefault-api/src/application/useCases/generateDiagnosisUseCase.ts)).*

#### [MODIFY] [prismaEvidenceRepository.ts](file:///c:/WhoseFault/whosefault-api/src/infra/repositories/prismaEvidenceRepository.ts#L97-L112)
Trocar `Evidence.create({...})` por `Evidence.restore({...})` em `mapRecordToDomain`.
- Adicionar teste unitário em [evidence.test.ts](file:///c:/WhoseFault/whosefault-api/src/tests/domain/evidence.test.ts) confirmando que `Evidence.restore` reidrata registros legados sem lançar `SensitiveDataDetectedError`.

* **Validação PA-09:** `npx --prefix whosefault-api vitest run src/tests/domain/evidence.test.ts`
* **Commit sugerido:** `refactor(api): introduce Evidence.restore for safe repository rehydration`

---

## Proposed Changes — Onda 3: Sessão, Account Linking e Polling (`whosefault-web` + API)

### PA-13 · `[minor]` Eliminar `POST /auth/sync` duplicado e aguardar perfil antes de expor `user` (Achado #13)
* **Dependências:** Independente (primeiro passo recomendado na Onda 3).
* **Escopo:** Sincronizar o perfil no `onAuthStateChanged` **antes** de publicar `user`/`profile` para o `OccurrencesContext` e remover chamadas redundantes em `signInWithGoogle` (fluxo normal) e `signInAsGuest`, mantendo chamada explícita apenas em `linkWithPopup` (que muta o usuário atual sem disparar troca de UID no `onAuthStateChanged`).

#### [MODIFY] [AuthContext.tsx](file:///c:/WhoseFault/whosefault-web/src/context/AuthContext.tsx#L40-L124)
```diff
   useEffect(() => {
     const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
-      setUser(currentUser);
       if (currentUser) {
         try {
           const synced = await syncUserProfile();
           setProfile(synced);
         } catch (err) {
           console.warn("Não foi possível sincronizar o perfil no momento:", err);
         }
+        setUser(currentUser);
       } else {
+        setUser(null);
         setProfile(null);
       }
       setLoading(false);
     });
```
E remover os pares redundantes `setUser(...)` + `await syncUserProfile()` de `signInAsGuest` e do ramo direto de `signInWithGoogle` (mantendo apenas no ramo de `linkWithPopup` onde o UID permanece o mesmo).

* **Validação PA-13:** `npm --prefix whosefault-web run lint && npm --prefix whosefault-web run build`
* **Commit sugerido:** `fix(web): deduplicate user profile sync and await profile before publishing auth user`

---

### PA-14 · `[minor]` Usar `signInWithCredential` em vez de segundo `signInWithPopup` (Achado #14)
* **Dependências:** Recomendado após `PA-13`.
* **Escopo:** Evitar bloqueio de pop-up por perda de *user gesture* quando `linkWithPopup` retorna `auth/credential-already-in-use`.

#### [MODIFY] [AuthContext.tsx](file:///c:/WhoseFault/whosefault-web/src/context/AuthContext.tsx#L2-L88)
Importar `GoogleAuthProvider` e `signInWithCredential` de `firebase/auth`, extraindo a credencial diretamente do erro:
```ts
const credential = GoogleAuthProvider.credentialFromError(
  linkErr as Parameters<typeof GoogleAuthProvider.credentialFromError>[0],
);
if (!credential) {
  throw linkErr;
}
await signInWithCredential(auth, credential);
```

* **Validação PA-14:** `npm --prefix whosefault-web run lint && npm --prefix whosefault-web run build`
* **Commit sugerido:** `fix(web): reuse pending OAuth credential instead of opening second popup`

---

### PA-15 · `[minor]` Preservar (ou alertar sobre) investigações do visitante em `auth/credential-already-in-use` (Achado #15)
* **Dependências:** `PA-14`.
* **Escopo (Abordagem A — Recomendada):** Quando um visitante vincula uma conta Google já existente:
  1. Antes de chamar `signInWithCredential(auth, credential)`, capturar `const guestToken = await auth.currentUser.getIdToken()`.
  2. No backend, adicionar `POST /api/auth/merge-guest` em [auth.routes.ts](file:///c:/WhoseFault/whosefault-api/src/http/routes/auth.routes.ts) + caso de uso `mergeGuestAccount.ts` + método `transferOwnership(fromUserId, toUserId)` em `IOccurrenceRepository` ([occurrenceRepository.ts](file:///c:/WhoseFault/whosefault-api/src/infra/repositories/occurrenceRepository.ts) e [prismaOccurrenceRepository.ts](file:///c:/WhoseFault/whosefault-api/src/infra/repositories/prismaOccurrenceRepository.ts)):
     - Verifica o token atual (usuário Google de destino, `!isAnonymous`) e `guestToken` (usuário visitante de origem, `isAnonymous === true`).
     - Move todas as ocorrências `userId = guestUser.id` → `targetUser.id` e remove `guestUser` do banco.
  3. No frontend ([api.ts](file:///c:/WhoseFault/whosefault-web/src/services/api.ts) e [AuthContext.tsx](file:///c:/WhoseFault/whosefault-web/src/context/AuthContext.tsx)), chamar `await mergeGuestSession(guestToken)` logo após `signInWithCredential`, garantindo zero perda de ocorrências!
  *(Caso prefira a **Abordagem B** na pergunta aberta acima, faremos apenas a tela de confirmação explícita no [LoginDialog.tsx](file:///c:/WhoseFault/whosefault-web/src/components/auth/LoginDialog.tsx) antes de executar `signInWithCredential`).*

* **Validação PA-15:** `npm --prefix whosefault-api run test:unit && npm --prefix whosefault-web run build`
* **Commit sugerido:** `feat(auth): migrate guest occurrences when linking to an existing Google account`

---

### PA-12 · `[minor]` Fechar `LoginDialog` automaticamente após vínculo de conta Google (Achado #12)
* **Dependências:** Recomendado junto ou após `PA-14`.
* **Escopo:** Fechar o modal de promoção de conta em [AppShell.tsx](file:///c:/WhoseFault/whosefault-web/src/components/layout/AppShell.tsx) / [LoginDialog.tsx](file:///c:/WhoseFault/whosefault-web/src/components/auth/LoginDialog.tsx) assim que `user` deixar de ser anônimo.

#### [MODIFY] [LoginDialog.tsx](file:///c:/WhoseFault/whosefault-web/src/components/auth/LoginDialog.tsx#L23-L36)
```tsx
  const isAnonymous = user?.isAnonymous ?? false;

  React.useEffect(() => {
    if (open && canClose && user && !isAnonymous) {
      onOpenChange?.(false);
    }
  }, [open, canClose, user, isAnonymous, onOpenChange]);
```

* **Validação PA-12:** `npm --prefix whosefault-web run lint && npm --prefix whosefault-web run build`
* **Commit sugerido:** `fix(web): auto-close LoginDialog when guest finishes Google account linking`

---

### PA-11 · `[minor]` Evitar reagendamento de polling de título já cancelado (Achado #11)
* **Dependências:** Independente.
* **Escopo:** Impedir que uma requisição `api.getOccurrence(occurrenceId)` em voo durante `stopTitlePolling` ou `clearAllTitlePolling` reagende `scheduleAttempt(attempt + 1)` após resolver.

#### [MODIFY] [OccurrencesContext.tsx](file:///c:/WhoseFault/whosefault-web/src/context/OccurrencesContext.tsx#L102-L181)
Adicionar `const pollTokensRef = useRef<Map<string, symbol>>(new Map())`:
- Em `stopTitlePolling(occurrenceId)`: `pollTokensRef.current.delete(occurrenceId)`.
- Em `clearAllTitlePolling()` e no cleanup do `useEffect` de desmontagem: `pollTokensRef.current.clear()`.
- Em `pollOccurrenceTitle`: criar `const token = Symbol(occurrenceId)`, salvar `pollTokensRef.current.set(occurrenceId, token)` e checar `if (pollTokensRef.current.get(occurrenceId) !== token) return;` imediatamente após `await api.getOccurrence(occurrenceId)` (tanto no bloco `try` antes de `setOccurrences` quanto antes do `if (attempt < maxAttempts)`).

* **Validação PA-11:** `npm --prefix whosefault-web run lint && npm --prefix whosefault-web run build`
* **Commit sugerido:** `fix(web): guard async title polling with cancellation tokens`

---

## Proposed Changes — Onda 4: UX de Validação e Acessibilidade (`whosefault-web`)

### PA-16 · `[minor]` Tornar cards de ocorrências acessíveis por teclado e leitores de tela (Achado #16)
* **Dependências:** Independente.
* **Escopo:** Permitir foco via `Tab`, ativação via `Enter` / `Espaço` e semântica adequada de navegação nos cards da listagem, preservando `data-testid={`occurrence-card-${occ.id}`}`.

#### [MODIFY] [OccurrencesListPage.tsx](file:///c:/WhoseFault/whosefault-web/src/pages/OccurrencesListPage.tsx#L163-L168)
Adicionar atributos semânticos, suporte a teclado e anel de foco visível ao `<Card>`:
```tsx
              <Card
                key={occ.id}
                role="link"
                tabIndex={0}
                aria-label={`${occ.apiName}: ${occ.title} (${occ.method} ${occ.url})`}
                data-testid={`occurrence-card-${occ.id}`}
                onClick={() => navigate(`/occurrences/${occ.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/occurrences/${occ.id}`);
                  }
                }}
                className="group cursor-pointer border-zinc-800/90 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 transition-all duration-150"
              >
```

* **Validação PA-16:** `npm --prefix whosefault-web run lint && npm --prefix whosefault-web run build`
* **Commit sugerido:** `fix(web): make occurrence cards keyboard and screen-reader accessible`

---

### PA-17 · `[minor]` Exibir alerta de segredo apenas quando `err.guidance` existir (Achado #17)
* **Dependências:** Independente.
* **Escopo:** Não rotular erros HTTP `422` genéricos (sem `guidance` de segurança) como `"Bloqueio de Segurança: Possível Segredo Detectado"`.

#### [MODIFY] [CreateEvidenceDialog.tsx](file:///c:/WhoseFault/whosefault-web/src/components/domain/CreateEvidenceDialog.tsx#L260-L268)
```diff
     } catch (err) {
-      if (
-        err instanceof ApiError &&
-        (err.status === 422 || Boolean(err.guidance))
-      ) {
+      if (err instanceof ApiError && Boolean(err.guidance)) {
         setSecretAlert({
           message: err.message,
           guidance: err.guidance,
         });
       } else {
```

* **Validação PA-17:** `npm --prefix whosefault-web run lint && npm --prefix whosefault-web run build`
* **Commit sugerido:** `fix(web): show secret detection banner only when security guidance is present`

---

## Verification Plan

### Automated Tests
Ao final de cada plano individual (ou de cada onda), executaremos:
1. **Testes unitários e de rotas HTTP do backend (`whosefault-api`):**
   ```powershell
   npm --prefix c:\WhoseFault\whosefault-api run test:unit
   ```
2. **Checagem estática de tipos e compilação do backend (`whosefault-api`):**
   ```powershell
   npm --prefix c:\WhoseFault\whosefault-api run typecheck
   npm --prefix c:\WhoseFault\whosefault-api run build
   ```
3. **Linter e build de produção + TypeScript do frontend (`whosefault-web`):**
   ```powershell
   npm --prefix c:\WhoseFault\whosefault-web run lint
   npm --prefix c:\WhoseFault\whosefault-web run build
   ```

### Manual Verification
1. **Autenticação e Isolamento (`PA-01` & `PA-02`):** Verificar via `curl` sem header `Authorization` em `http://localhost:3333/api/occurrences` que a API responde `401 Unauthorized`.
2. **Vínculo de Conta Visitante → Google (`PA-12` a `PA-15`):** Criar uma ocorrência em Modo Visitante, clicar em *"Salvar conta com Google"*, autenticar e confirmar que o `LoginDialog` fecha sozinho, não abre segundo pop-up e mantém a ocorrência criada na listagem.
3. **Navegação por Teclado (`PA-16`):** Na tela `/occurrences`, pressionar `Tab` até focar um card de ocorrência e pressionar `Enter` para abrir os detalhes.
