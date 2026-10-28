# SPEC-05 — Login com Firebase

## 1. Objetivo

Permitir que o usuário acesse a plataforma escolhendo entre autenticar-se com sua conta Google (via Firebase Auth) ou acessar de forma imediata por meio do Modo Visitante (Autenticação Anônima do Firebase), permitindo ainda que uma sessão de visitante seja promovida para conta Google sem perda dos dados criados.

O fluxo de autenticação no front-end deve ser independente de instabilidades na API principal da GCE para a obtenção do token, garantindo que o usuário consiga gerar sua credencial no Firebase e prosseguir com a experiência de uso.

## 2. Escopo
Esta especificação contempla:

- Instalação do SDK do Firebase (`npm install firebase`) no front-end (`whosefault-web`).
- Criação e centralização do arquivo de inicialização e serviços do Firebase (`src/services/firebase.ts`).
- Criação do contexto de autenticação (`AuthContext`) para expor usuário ativo, estado de autenticação e ações de login/logout.
- Desenvolvimento da tela/modal de login integrada ao design system da plataforma.
- Implementação da autenticação via popup com a conta Google (`signInWithPopup`).
- Implementação da vinculação de conta Google a uma sessão anônima existente (`linkWithPopup`), preservando o UID e o histórico do usuário.
- Implementação da autenticação anônima para o Modo Visitante (`signInAnonymously`).
- Extração dinâmica e renovação automática do Token JWT do Firebase para injeção nas requisições HTTP subsequentes (`auth.currentUser.getIdToken()`).
- Persistência local da sessão de usuário gerenciada pelo próprio SDK do Firebase.

Não contempla o armazenamento relacional dos usuários no PostgreSQL, nem a criação da rota de sincronização no backend, que são tratados na SPEC-06.

## 3. Requisitos funcionais

### RF-01 — Inicialização do Firebase

O sistema deve inicializar o SDK do Firebase no front-end utilizando variáveis de ambiente seguras com prefixo Vite (`VITE_FIREBASE_*`), garantindo que as chaves de API e IDs de projeto sejam injetados adequadamente sem hardcoding no código-fonte.

### RF-02 — Login com Conta Google e Promoção de Visitante (Account Linking)

O sistema deve disponibilizar um botão dedicado ao login com o Google. Ao ser acionado:
1. Se o usuário estiver atualmente em uma sessão de **Modo Visitante** (anônimo), o sistema deve tentar vincular a credencial Google ao usuário anônimo atual via `linkWithPopup`. Isso preserva o mesmo identificador (`firebase_uid`), migrando seu status para usuário permanente sem perda de ocorrências ou diagnósticos já criados.
2. Se o usuário não possuir sessão anônima ativa (ou se o vínculo não for aplicável), o sistema deve realizar o login direto via `signInWithPopup`.

### RF-03 — Acesso via Modo Visitante

O sistema deve disponibilizar um botão dedicado ao Modo Visitante. Ao ser acionado, deve disparar a função de login anônimo do Firebase (`signInAnonymously`), gerando um ID de sessão temporário e seguro sem exigir inputs de credenciais.

### RF-04 — Persistência e Monitoramento de Sessão

O front-end deve escutar as mudanças de estado de autenticação do Firebase (`onAuthStateChanged`), mantendo a sessão ativa localmente para que o usuário permaneça autenticado ao recarregar a página e disparando a sincronização com o backend.

### RF-05 — Extração Dinâmica do Token JWT (Renovação Automática)

O cliente HTTP (`api.ts`) deve obter o token JWT atualizado através de `auth.currentUser.getIdToken()` imediatamente antes de cada requisição autenticada, garantindo que tokens expirados sejam renovados de forma transparente pelo SDK do Firebase e injetados no cabeçalho `Authorization: Bearer <token>`.

### RF-06 — Indicação Visual de Modo Visitante

A interface da aplicação (cabeçalho/AppShell) deve exibir claramente quando o usuário estiver navegando em Modo Visitante, disponibilizando um atalho visível para "Salvar conta com Google" ou efetuar logout.

## 4. Regras de negócio

### RN-01 — Exclusividade de Sessão e Promoção de Conta

Um usuário não deve possuir múltiplos estados de autenticação simultâneos na mesma sessão de navegador.
- Caso o usuário anônimo promova sua conta vinculando o Google (`linkWithPopup`), o `firebase_uid` deve ser mantido inalterado.
- Caso a conta Google informada já pertença a outro usuário previamente cadastrado (`auth/credential-already-in-use`), o sistema deve informar o usuário e oferecer a opção de trocar de conta (descartando a sessão temporária anônima ou cancelando a ação).

### RN-02 — Feedback Visual de Carregamento

Enquanto o popup do Google estiver aberto ou a requisição de login anônimo estiver em andamento, os botões de ação correspondentes devem exibir um estado de loading e ser desativados para evitar múltiplos disparos concorrentes.

### RN-03 — Tratamento de Erros e Cancelamento de Pop-up

Caso ocorra falha ou cancelamento explícito do pop-up pelo usuário (`auth/popup-closed-by-user`, `auth/cancelled-popup-request`), o sistema deve capturar a exceção gracefully, mantendo o usuário na tela de login com uma mensagem amigável e sem travamentos.

## 5. Critérios de aceitação

### CA-01 — Inicialização bem-sucedida

**Dado que** o front-end foi configurado com as variáveis de ambiente `VITE_FIREBASE_*`,  
**quando** a aplicação for carregada,  
**então** o SDK do Firebase deve inicializar sem erros no console.

### CA-02 — Sucesso no login direto com Google

**Dado que** um novo visitante não autenticado clicou no botão "Entrar com conta Google",  
**quando** o fluxo de pop-up for concluído com sucesso,  
**então** o Firebase deve emitir um token JWT contendo `is_anonymous = false`, e o usuário deve ser redirecionado para a aplicação autenticada.

### CA-03 — Sucesso no Modo Visitante

**Dado que** o usuário clicou no botão "Entrar como Visitante",  
**quando** a função de login anônimo for disparada,  
**então** o sistema deve autenticar o usuário como anônimo (`isAnonymous: true`), gerando seu token JWT e liberando acesso à plataforma.

### CA-04 — Sucesso na conversão de Visitante para Google (Account Linking)

**Dado que** o usuário está autenticado no Modo Visitante com um `UID` específico e clica em "Salvar conta com Google",  
**quando** o pop-up for concluído com uma conta Google nova,  
**então** o usuário deve ser atualizado para `isAnonymous: false` mantendo o mesmo `UID`, garantindo acesso contínuo aos dados criados durante a sessão de visitante.

### CA-05 — Renovação transparente de token expirado

**Dado que** o token JWT do usuário expirou após o período padrão de 1 hora,  
**quando** uma nova requisição de API for disparada via `api.ts`,  
**então** a chamada `getIdToken()` deve renovar o token automaticamente sem gerar erro 401 por expiração no backend.

### CA-06 — Tratamento de cancelamento do Google

**Dado que** o usuário acionou o login com o Google,  
**quando** fechar a janela de pop-up antes de concluir,  
**então** o sistema deve capturar o erro de cancelamento e retornar o usuário à tela de login com uma mensagem informativa.

## 6. Fora do escopo

- Persistência dos dados do usuário no banco PostgreSQL (tratada na SPEC-06).
- Validação e assinatura do token JWT no backend Fastify (tratada na SPEC-06).
- Definição de regras de ciclo de vida de 30 dias para contas anônimas (tratada na SPEC-06).
