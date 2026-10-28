# ADR-005 — Autenticação híbrida (Firebase Auth) e isolamento multi-inquilino

- **Status:** Aprovado
- **Data:** 2026-10-27

## 1. Contexto

Na versão 1.0 (V1), o WhoseFault foi concebido com foco na criação do fluxo central de investigação: registro de ocorrências, gestão de evidências e diagnósticos via IA. Todas as ocorrências residiam em um escopo global sem autenticação de usuários.

Com a evolução da plataforma, tornou-se essencial:
1. Permitir que desenvolvedores utilizem a ferramenta com baixíssima fricção inicial, podendo testar o sistema sem preencher cadastros demorados.
2. Permitir que usuários autentiquem com segurança utilizando suas contas Google corporativas ou pessoais.
3. Garantir o isolamento dos dados (multi-inquilino), de modo que cada usuário acesse apenas as ocorrências e evidências que registrou.
4. Possibilitar a promoção fluida de uma sessão anônima (*Modo Visitante*) para uma conta Google vinculada (*Account Linking*), sem perda do histórico gerado.
5. Manter as regras do [ADR-001](ADR-001-arquitetura-em-camadas.md), isolando SDKs externos de autenticação (Firebase) fora das camadas de domínio e aplicação.

## 2. Decisão proposta

Adotar autenticação gerenciada pelo **Firebase Authentication** no frontend combinada com validação descentralizada via **Firebase Admin SDK** no backend Fastify e isolamento relacional no PostgreSQL.

### 2.1. Estratégia Híbrida de Autenticação (Google OAuth + Modo Visitante)
- **Login com Google:** Autenticação via pop-up padrão OAuth 2.0.
- **Modo Visitante (Anônimo):** Sessão temporária sem credenciais via `signInAnonymously`.
- **Promoção de Conta (*Account Linking*):** Usuários no Modo Visitante podem vincular sua conta Google (`linkWithPopup`), mantendo o mesmo `firebase_uid` e preservando todas as suas investigações anteriores.

### 2.2. Isolamento de Domínio e Camadas (Conformidade com ADR-001)
- O backend expõe uma interface abstrata `ITokenVerifier` na fronteira de aplicação/domínio.
- A implementação concreta `FirebaseTokenVerifier` reside estritamente na camada `infra/auth`, utilizando o Firebase Admin SDK para validar tokens JWT recebidos no cabeçalho `Authorization: Bearer <token>`.
- Um adaptador de testes (`StubTokenVerifier`) é mantido para permitir que os testes unitários e de rotas Fastify sejam executados rapidamente sem conexão com a nuvem ou chaves privadas.

### 2.3. Modelagem e Isolamento Relacional (PostgreSQL)
- Uma tabela `users` armazena o perfil do usuário indexado pelo `firebase_uid`, registrando se a conta é anônima (`is_anonymous: boolean`) e o carimbo do último acesso (`updated_at`).
- A tabela `occurrences` recebe a chave estrangeira `user_id` vinculada a `users(id)` com regra de integridade `ON DELETE CASCADE`.
- As consultas e operações de ocorrências, evidências e diagnósticos passam a ser estritamente escopadas pelo `user_id` do usuário autenticado.

### 2.4. Ciclo de Vida e Expurgo de Contas Temporárias
- Contas anônimas inativas por mais de 30 dias são expurgadas automaticamente por uma rotina agendada/executável (`cleanup:guests`).
- A deleção em cascata no PostgreSQL garante a limpeza completa de ocorrências, evidências e diagnósticos vinculados à conta anônima expirada, sem registros órfãos.
- Os UIDs correspondentes são removidos no Firebase Authentication via exclusão em lote (`admin.auth().deleteUsers`).

## 3. Alternativas consideradas

### A. Autenticação Proprietária com Senhas e JWTs Internos
Implementar cadastro com e-mail/senha, hash bcrypt, envio de e-mails de confirmação e emissão de tokens JWT próprios.
- *Desvantagens:* Alto custo de implementação e manutenção de segurança, maior fricção para o desenvolvedor testar a ferramenta e risco de vazamento de credenciais.

### B. Manter Ocorrências Compartilhadas sem Vínculo de Usuário
Autenticar apenas no frontend para liberação de acesso visual, sem alterar o schema do PostgreSQL.
- *Desvantagens:* Falta de privacidade técnica; qualquer visitante ou usuário conectado veria as requisições, headers e diagnósticos confidenciais de outros usuários.

### C. Firebase Auth + Account Linking + Isolamento por `user_id` (Recomendada)
- *Vantagens:* Equilíbrio ideal entre segurança corporativa (Google OAuth), zero barreira de entrada (Modo Visitante) e privacidade estrita com cascade delete automático.

## 4. Consequências

- **Positivas:**
  - Isolamento seguro e confiável de informações entre usuários.
  - Onboarding instantâneo para novos desenvolvedores.
  - Conformidade estrita com o ADR-001 através de portas/adaptadores para testes.
- **Atenção:**
  - A rota `POST /api/auth/sync` passa a ser necessária logo após a inicialização da sessão no cliente para sincronizar o usuário relacional antes da emissão de comandos de criação.
  - As chamadas de API devem sempre obter o token dinâmico (`getIdToken()`) para tolerar expirações de 1h de forma transparente.
