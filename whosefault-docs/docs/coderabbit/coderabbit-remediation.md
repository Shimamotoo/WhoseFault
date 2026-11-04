# Plano de Remediação e Hardening — CodeRabbit Review

Documento de rastreamento das correções, refatorações e melhorias de segurança identificadas na revisão de código executada pelo CodeRabbit CLI no `whosefault-api` e `whosefault-web`.

| Métrica | Valor |
| :--- | :--- |
| **Total de Achados** | 17 (1 crítico, 6 maiores, 10 menores) |
| **Backend (`whosefault-api`)** | 10 achados |
| **Frontend (`whosefault-web`)** | 7 achados |
| **Estratégia de Execução** | 4 Ondas Progressivas / 17 Planos Atômicos (PA-01 a PA-17) |

---

## Matriz de Rastreamento de Planos de Ação (PA)

### Onda 1 — Segurança Crítica, IDOR e Superfície HTTP (`whosefault-api`)

- [x] **PA-01** `[critical]` — **Autenticação obrigatória por padrão em produção**
  - **Problema:** `requireAuth` padrão `false` permite que requisições sem `Authorization` ignorem a autenticação e listem dados globais.
  - **Ação:** Tornar `requireAuth = true` por padrão em `server.ts`, declarar explicitamente em `index.ts` e exigir `userId` em `findAll()`.
  - **Arquivos:** `whosefault-api/src/http/server.ts`, `whosefault-api/src/index.ts`, `whosefault-api/src/infra/repositories/prismaOccurrenceRepository.ts`.

- [x] **PA-02** `[major]` — **Verificação centralizada de propriedade / Anti-IDOR**
  - **Problema:** Falta verificação de propriedade (`occurrence.userId === userId`) em rotas de evidências, diagnóstico e edição de ocorrências.
  - **Ação:** Criar guard `assertOccurrenceOwnership` e aplicá-lo em todos os casos de uso e rotas que interagem com uma ocorrência existente.
  - **Arquivos:** `whosefault-api/src/application/occurrenceOwnership.ts` *(novo)*, rotas e casos de uso de ocorrências, evidências e diagnósticos.

- [x] **PA-03** `[major]` — **Impedir sobrescrita de IDs via spread `...body`**
  - **Problema:** No handler `PATCH` de evidências, espalhar `body` após os parâmetros de rota permite sobrescrever `occurrenceId` e `evidenceId`.
  - **Ação:** Mapear explicitamente apenas os campos permitidos do payload no handler da rota.
  - **Arquivos:** `whosefault-api/src/http/routes/evidence.routes.ts`.

- [x] **PA-04** `[major]` — **Restringir HTTP 400 a erros de validação de domínio**
  - **Problema:** `err instanceof Error` converte qualquer erro (incluindo falhas do Prisma ou infraestrutura) em HTTP 400 vazando `err.message`.
  - **Ação:** Criar `DomainValidationError` para erros de regras de negócio (HTTP 400) e retornar HTTP 500 genérico para erros inesperados.
  - **Arquivos:** `whosefault-api/src/domain/errors.ts` *(novo)*, entidades de domínio, rotas de ocorrências e evidências.

- [x] **PA-10** `[minor]` — **Preservar status 4xx nativos do Fastify no Error Handler Global**
  - **Problema:** O handler global substitui erros de cliente do Fastify (ex.: JSON malformado 400, tamanho excessivo 413) por HTTP 500.
  - **Ação:** Preservar `error.statusCode` na faixa `400..499` no manipulador global.
  - **Arquivos:** `whosefault-api/src/http/server.ts`.

---

### Onda 2 — Integridade de Dados, Domínio e Expurgo (`whosefault-api`)

- [ ] **PA-05** `[major]` — **Preservar `description` em atualizações parciais (`PATCH`)**
  - **Problema:** Omitir `description` no JSON gravava `null` no banco e apagava a descrição existente.
  - **Ação:** Atualizar `updateOccurrence` para preservar o valor atual quando `input.description === undefined`.
  - **Arquivos:** `whosefault-api/src/application/updateOccurrence.ts`.

- [ ] **PA-06** `[major]` — **Inicialização explícita do Firebase Admin no expurgo de visitantes**
  - **Problema:** O script de cleanup dependia de construtor vazio, resultando em `getApps().length === 0` e nunca excluindo UIDs do Firebase Auth.
  - **Ação:** Extrair e invocar `ensureFirebaseAdminInitialized()` no script de limpeza.
  - **Arquivos:** `whosefault-api/src/infra/auth/firebaseTokenVerifier.ts`, `whosefault-api/src/infra/scripts/cleanupGuests.ts`.

- [ ] **PA-07** `[major]` — **Expurgo de imagens do GCS associadas a visitantes expirados**
  - **Problema:** `deleteMany` de usuários anônimos remove registros no PostgreSQL via cascade mas deixa objetos órfãos no Cloud Storage.
  - **Ação:** Buscar evidências `IMAGE` dos visitantes expirados e deletá-las via `IStorageService.deleteFile` antes da exclusão no banco.
  - **Arquivos:** `whosefault-api/src/application/cleanupGuests.ts`, `whosefault-api/src/infra/scripts/cleanupGuests.ts`.

- [ ] **PA-08** `[minor]` — **Permitir URIs de conexão sem credenciais no detector de segredos**
  - **Problema:** URIs como `redis://localhost:6379` eram bloqueadas sem possuir credenciais embutidas.
  - **Ação:** Exigir `user:password@` (ou `:password@`) na regex de strings de conexão de bancos/serviços.
  - **Arquivos:** `whosefault-api/src/domain/services/secretDetector.ts`.

- [ ] **PA-09** `[minor]` — **Separar reidratação (`Evidence.restore`) da validação de criação**
  - **Problema:** `mapRecordToDomain` no repositório executava validação de segredos ao ler dados já persistidos, quebrando leituras com regras novas.
  - **Ação:** Implementar método de fábrica `Evidence.restore` sem validação de entrada de usuário para reidratação relacional.
  - **Arquivos:** `whosefault-api/src/domain/evidence.ts`, `whosefault-api/src/infra/repositories/prismaEvidenceRepository.ts`.

---

### Onda 3 — Sessão, Vínculo de Conta e Polling (`whosefault-web` + API)

- [ ] **PA-13** `[minor]` — **Deduplicar sincronização de perfil (`POST /auth/sync`)**
  - **Problema:** Chamadas concorrentes a `syncUserProfile()` e publicação de `user` antes de obter o perfil criavam buscas prematuras.
  - **Ação:** Aguardar perfil no `onAuthStateChanged` antes de emitir `user` e remover chamadas redundantes nos fluxos de login direto.
  - **Arquivos:** `whosefault-web/src/context/AuthContext.tsx`.

- [ ] **PA-14** `[minor]` — **Reaproveitar credencial OAuth pendente sem abrir segundo pop-up**
  - **Problema:** Abrir segundo pop-up após colisão de credencial perde o gesto do usuário e é bloqueado pelos navegadores.
  - **Ação:** Usar `GoogleAuthProvider.credentialFromError` e autenticar com `signInWithCredential`.
  - **Arquivos:** `whosefault-web/src/context/AuthContext.tsx`.

- [ ] **PA-15** `[minor]` — **Migração de ocorrências do visitante em caso de colisão de conta Google**
  - **Problema:** Ao vincular visitante com conta Google já existente, as ocorrências criadas no modo anônimo eram abandonadas.
  - **Ação:** Endpoint `POST /api/auth/merge-guest` transferindo ocorrências do visitante para a conta permanente.
  - **Arquivos:** `whosefault-api/src/http/routes/auth.routes.ts`, `whosefault-api/src/application/mergeGuestAccount.ts`, `whosefault-web/src/services/api.ts`, `whosefault-web/src/context/AuthContext.tsx`.

- [ ] **PA-12** `[minor]` — **Auto-fechar `LoginDialog` após visitante vincular conta Google**
  - **Problema:** O modal permanecia aberto após o sucesso do vínculo de conta.
  - **Ação:** Adicionar efeito observando a transição de `isAnonymous === false` para invocar `onOpenChange(false)`.
  - **Arquivos:** `whosefault-web/src/components/auth/LoginDialog.tsx`.

- [ ] **PA-11** `[minor]` — **Token de cancelamento para polling assíncrono de título**
  - **Problema:** Requisições assíncronas em voo reagendavam novas tentativas de polling mesmo após cancelamento/logout.
  - **Ação:** Implementar controle de token por ocorrência (`Symbol`) invalidando execuções defasadas.
  - **Arquivos:** `whosefault-web/src/context/OccurrencesContext.tsx`.

---

### Onda 4 — UX de Validação e Acessibilidade (`whosefault-web`)

- [ ] **PA-16** `[minor]` — **Acessibilidade por teclado e leitores de tela nos cards de ocorrências**
  - **Problema:** Cards navegáveis apenas via clique de mouse em `div`.
  - **Ação:** Adicionar `role="link"`, `tabIndex={0}`, `aria-label`, suporte a teclas `Enter` / `Space` e anel de foco.
  - **Arquivos:** `whosefault-web/src/pages/OccurrencesListPage.tsx`.

- [ ] **PA-17** `[minor]` — **Exibir banner de segredo apenas quando houver orientação de segurança**
  - **Problema:** Qualquer status 422 disparava o banner de bloqueio de segurança mesmo sem envolver detecção de segredos.
  - **Ação:** Condicionar exibição do banner estritamente à presença de `err.guidance`.
  - **Arquivos:** `whosefault-web/src/components/domain/CreateEvidenceDialog.tsx`.

---

## Log de Execução e Status

| PA | Descrição | Status | Data de Conclusão | Commit / PR |
| :---: | :--- | :---: | :---: | :--- |
| **PA-01** | Auth obrigatória por padrão | `Concluído` | 2026-11-04 | — |
| **PA-02** | Guard de Ownership / Anti-IDOR | `Concluído` | 2026-11-04 | — |
| **PA-03** | Blindagem de params vs body | `Concluído` | 2026-11-04 | — |
| **PA-04** | DomainValidationError vs HTTP 500 | `Concluído` | 2026-11-04 | — |
| **PA-05** | Preservar description no PATCH | `Pendente` | — | — |
| **PA-06** | Init explícito do Firebase Admin | `Pendente` | — | — |
| **PA-07** | Limpeza de imagens GCS no cleanup | `Pendente` | — | — |
| **PA-08** | Regex de connection strings | `Pendente` | — | — |
| **PA-09** | Evidence.restore na reidratação | `Pendente` | — | — |
| **PA-10** | Preservar status 4xx no error handler | `Concluído` | 2026-11-04 | — |
| **PA-11** | Token de cancelamento no polling | `Pendente` | — | — |
| **PA-12** | Auto-fechar LoginDialog | `Pendente` | — | — |
| **PA-13** | Deduplicar sync de perfil | `Pendente` | — | — |
| **PA-14** | signInWithCredential sem 2º popup | `Pendente` | — | — |
| **PA-15** | Migração de dados de visitante | `Pendente` | — | — |
| **PA-16** | Acessibilidade por teclado nos Cards | `Pendente` | — | — |
| **PA-17** | Alerta de segredo restrito a guidance | `Pendente` | — | — |
