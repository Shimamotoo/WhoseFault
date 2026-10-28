# SPEC-06 — Gerenciar Identidade

## 1. Objetivo

Adaptar o backend hospedado na GCE (Node.js/Fastify) e o banco de dados PostgreSQL para validar os tokens JWT gerados pelo Firebase, persistir o domínio de usuários (IAM), isolar as ocorrências por usuário e gerenciar o ciclo de vida dos registros, distinguindo contas autenticadas com Google de contas de convidados (anônimas).

## 2. Escopo
Esta especificação contempla:

- Modelagem da tabela `users` no PostgreSQL e adição da chave estrangeira `user_id` na tabela `occurrences` com deleção em cascata (`CASCADE`).
- Criação do contrato abstrato de verificação de autenticação (`ITokenVerifier`) e implementação concreta com Firebase Admin SDK na camada de infraestrutura (`src/infra/auth`), em conformidade com o ADR-001.
- Suporte a `StubTokenVerifier` para manter a suíte de testes automatizados rápida e desacoplada de credenciais externas.
- Implementação de middleware/preHandler de segurança no Fastify para validação de tokens JWT do Firebase no cabeçalho `Authorization: Bearer <token>`.
- Criação da rota protegida de sincronização de perfil (`POST /api/auth/sync`).
- Implementação da regra de persistência por UPSERT baseada no `firebase_uid`.
- Associação automática de novas ocorrências ao usuário autenticado e filtragem das consultas por usuário.
- Implementação de rotina executável/agendada para expurgo de contas anônimas inativas há mais de 30 dias (removendo dados tanto do PostgreSQL quanto do Firebase Auth via batch delete).

Não contempla o design ou componentes visuais da tela de login do front-end (tratados na SPEC-05).

## 3. Requisitos funcionais

### RF-01 — Modelagem de Usuários e Vínculo com Ocorrências

1. O banco de dados PostgreSQL deve possuir a tabela `users` contendo:
   - `id`: UUID (chave primária).
   - `firebase_uid`: String única (índice único para UPSERT).
   - `email`: String opcional (nulo para anônimos).
   - `name`: String opcional (nome do perfil Google).
   - `is_anonymous`: Booleano obrigatório.
   - `created_at`: Data e hora de criação.
   - `updated_at`: Data e hora da última sincronização/atividade.

2. A tabela `occurrences` deve receber o campo `user_id` (UUID, obrigatório ou com valor padrão de transição), vinculado a `users(id)` com `ON DELETE CASCADE`.

### RF-02 — Rota de Sincronização de Perfil (POST /api/auth/sync)

O backend deve expor o endpoint protegido `POST /api/auth/sync`. Ao receber uma requisição autenticada, a rota deve:
- Extrair o `firebase_uid`, `email` e `name` validados do token.
- Executar um UPSERT na tabela `users`: se o usuário já existir, atualiza `updated_at`, `email` e a flag `is_anonymous` (permitindo a promoção de visitante para Google); se não existir, cria o novo registro.
- Retornar o perfil do usuário cadastrado/atualizado com status `200 OK`.

### RF-03 — Middleware de Validação e Isolamento Arquitetural (ADR-001)

1. A validação de identidade deve ser mediada por uma porta/interface `ITokenVerifier` que recebe o token bruto e retorna os dados decodificados (`DecodedUserToken`).
2. A camada `infra/auth` deve implementar `FirebaseTokenVerifier` utilizando o Firebase Admin SDK.
3. Para testes automatizados, deve ser disponibilizado um `StubTokenVerifier`, permitindo simular requisições autenticadas sem necessidade de conexão com o Firebase.
4. As rotas protegidas (`/api/occurrences*` e `/api/auth/sync`) devem aplicar o middleware de autenticação, injetando o usuário decodificado na requisição (`request.user`).

### RF-04 — Isolamento de Ocorrências por Usuário (Multi-inquilino)

- Ao criar uma ocorrência (`POST /api/occurrences`), o `user_id` deve ser preenchido automaticamente com base no usuário autenticado.
- As consultas de ocorrências (`GET /api/occurrences` e `GET /api/occurrences/:id`) devem retornar apenas os registros pertencentes ao usuário autenticado, impedindo vazamento de dados entre usuários ou visitantes.

### RF-05 — Rotina de Expurgo de Convidados Inativos (30 dias)

O sistema deve disponibilizar um comando/rotina de limpeza (`npm run cleanup:guests` ou job agendado) que:
1. Localiza no banco de dados todas as contas onde `is_anonymous = true` e `updated_at < NOW() - INTERVAL '30 days'`.
2. Remove essas contas da tabela `users` no PostgreSQL (a deleção em cascata removerá automaticamente as ocorrências, evidências e diagnósticos associados).
3. Remove os usuários correspondentes no Firebase Authentication em lotes através de `admin.auth().deleteUsers(uids)`.

## 4. Regras de negócio

### RN-01 — Persistência por UPSERT e Atualização de Status

Toda sincronização (`POST /api/auth/sync`) deve atualizar o campo `updated_at` do usuário. Se uma conta anteriormente anônima agora enviar um token com credencial Google, o campo `is_anonymous` deve ser alterado de `true` para `false` no banco de dados mantendo o mesmo `id` e histórico de ocorrências.

### RN-02 — Integridade Referencial e Expurgo Completo

Ao expurgar um usuário visitante inativo há mais de 30 dias, nenhuma ocorrência, evidência ou diagnóstico órfão deve permanecer no banco relacional.

### RN-03 — Proteção Restrita a Rotas Sensíveis

O middleware de autenticação deve rejeitar imediatamente com status HTTP `401 Unauthorized` qualquer requisição sem token, com token inválido ou expirado.

## 5. Critérios de aceitação

### CA-01 — Sincronização de usuário Google

**Dado que** um usuário realizou login com o Google e enviou seu token válido para `POST /api/auth/sync`,  
**quando** a requisição for processada,  
**então** o backend deve persistir/atualizar o registro com `is_anonymous = false` e retornar os dados do usuário.

### CA-02 — Sincronização de usuário Visitante

**Dado que** um usuário anônimo enviou seu token para `POST /api/auth/sync`,  
**quando** a requisição for processada,  
**então** o backend deve persistir/atualizar o registro com `is_anonymous = true`.

### CA-03 — Promoção de Visitante para Google

**Dado que** um usuário já possui registro anônimo com determinado `firebase_uid`,  
**quando** ele sincronizar novamente após vincular sua conta Google mantendo o mesmo `firebase_uid`,  
**então** o backend deve atualizar `is_anonymous` para `false` sem criar um novo usuário nem alterar seus registros anteriores.

### CA-04 — Isolamento de ocorrências entre usuários

**Dado que** o Usuário A e o Usuário B criaram ocorrências distintas,  
**quando** o Usuário A listar ocorrências via `GET /api/occurrences`,  
**então** o sistema deve retornar exclusivamente as ocorrências pertencentes ao Usuário A.

### CA-05 — Rejeição de requisições não autenticadas

**Dado que** uma requisição para rota protegida não possui o header `Authorization` válido,  
**quando** o middleware interceptar a requisição,  
**então** deve responder imediatamente com status HTTP 401 Unauthorized.

### CA-06 — Expurgo em lote após 30 dias

**Dado que** existem contas de visitantes com inatividade superior a 30 dias,  
**quando** a rotina de expurgo for executada,  
**então** os usuários e suas ocorrências vinculadas devem ser removidos do PostgreSQL e os UIDs deletados do Firebase Auth.

## 6. Fora do escopo

- Implementação de layouts visuais ou telas de login no front-end.
- Gestão de refresh tokens proprietários (o Firebase gerencia nativamente a renovação de tokens).
- Mecanismos de compartilhamento de ocorrências entre múltiplos usuários (previsto para versões futuras).
