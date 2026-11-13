# ADR-006 — Exposição do WhoseFault via Model Context Protocol (MCP)

- **Status:** Aprovado
- **Data:** 2026-11-13

## 1. Contexto

O WhoseFault centraliza ocorrências de integração com APIs, evidências técnicas e diagnósticos assistidos por IA. Atualmente, toda a interação do usuário ocorre pela interface web (`whosefault-web`) comunicando-se com a API REST (`whosefault-api`).

No fluxo real de desenvolvimento, porém, os erros de integração acontecem dentro da IDE, do terminal ou durante sessões com assistentes de IA. Copiar payloads, URLs, logs e diagnósticos manualmente entre o editor e o navegador gera atrito e perda de contexto.

Com a evolução do projeto e o objetivo de adotar e aprender o **Model Context Protocol (MCP)** de forma prática, surge a necessidade de decidir:
1. Como o servidor MCP será integrado à arquitetura existente sem violar o isolamento de camadas ([ADR-001](ADR-001-arquitetura-em-camadas.md)).
2. Como preservar integralmente as políticas de detecção de segredos ([ADR-004](ADR-004-seguranca-e-dados.md)) e o isolamento multi-inquilino ([ADR-005](ADR-005-autenticacao-e-identidade.md)).
3. Qual transporte e estratégia de autenticação adotar inicialmente.

## 2. Decisão proposta

Criar um novo pacote dedicado no monorepo, **`whosefault-mcp`**, implementado em TypeScript com o SDK oficial `@modelcontextprotocol/sdk`, atuando como um **adaptador fino sobre a API HTTP do `whosefault-api`**.

### 2.1. Topologia e Separação de Responsabilidades
- O `whosefault-mcp` não acessará diretamente o banco de dados PostgreSQL, Prisma, BullMQ/Redis, GCS ou o SDK do Gemini.
- Toda leitura e mutação de dados será realizada via chamadas HTTP autenticadas para a API existente (`whosefault-api`), tratando o backend HTTP como fonte única de verdade para regras de domínio, persistência, enfileiramento de títulos e validações de segurança.

### 2.2. Transporte Inicial (`stdio`)
- Na primeira versão (V1 do MCP), o servidor utilizará exclusivamente o transporte **`stdio`**, permitindo execução local direta por clientes MCP (IDEs, editores com agentes de IA, Claude Desktop e MCP Inspector).
- Como o canal `stdout` é reservado estritamente para mensagens JSON-RPC do protocolo MCP, quaisquer logs de diagnóstico do servidor MCP deverão ser direcionados exclusivamente para `stderr`.

### 2.3. Autenticação e Identidade (Alinhado ao ADR-005)
- O `whosefault-mcp` receberá via variáveis de ambiente a URL base da API (`WHOSEFAULT_API_URL`) e a credencial de acesso (`WHOSEFAULT_API_TOKEN`), enviando-a no cabeçalho `Authorization: Bearer <token>`.
- Na etapa inicial de desenvolvimento e testes locais, será utilizado o mecanismo de token já suportado pelo `authHook` da API (modo stub/desenvolvimento ou token de sessão válido).
- A criação de tokens de longa duração (*Personal Access Token* / *API Key*) no `whosefault-api`, para contornar a expiração de 1 hora dos JWTs padrão do Firebase Auth em sessões contínuas de IDE, fica registrada como evolução recomendada para uso em produção.

### 2.4. Preservação do Secret Guardrail (Alinhado ao ADR-004)
- Todas as operações de criação de ocorrências e evidências via MCP passarão pelos mesmos endpoints protegidos pelo `SecretDetector`.
- Quando a API rejeitar uma operação com `HTTP 422` (ou `400` no *double-check* de diagnóstico), o servidor MCP deverá retornar o erro estruturado ao cliente (`isError: true`), identificando os campos sinalizados sem ecoar valores sensíveis, instruindo o agente cliente a mascarar ou solicitar revisão ao usuário antes de tentar novamente.

## 3. Alternativas consideradas

### A. Novo pacote `whosefault-mcp` consumindo a API HTTP (`whosefault-api`) — recomendada
Um processo independente que traduz *Tools*, *Resources* e *Prompts* do MCP em requisições REST para o `whosefault-api`.
- **Vantagens:** Mantém fronteira limpa com o `whosefault-api`; garante automaticamente a aplicação do `authHook`, *ownership*, `SecretDetector` e enfileiramento BullMQ; evita duplicar configuração de Prisma/Redis/Firebase Admin no processo do MCP; facilita o aprendizado focado no protocolo MCP.
- **Desvantagens:** Exige que o `whosefault-api` esteja em execução e acessível para o servidor MCP funcionar; adiciona um salto HTTP local.

### B. Novo pacote `whosefault-mcp` importando diretamente os Casos de Uso e Repositórios
O servidor MCP importaria funções de `whosefault-api/src/application` e instanciaria repositórios Prisma diretamente.
- **Vantagens:** Elimina a dependência do servidor HTTP rodando e reduz latência.
- **Desvantagens:** Acopla o processo do cliente MCP às variáveis de ambiente de infraestrutura (PostgreSQL, Redis, GCS, Gemini); exige replicar a resolução de usuário/autenticação feita na camada HTTP, aumentando o risco de inconsistências de acesso.

### C. Embutir o servidor MCP dentro do próprio Fastify (`whosefault-api`)
Expor endpoints MCP (via *Streamable HTTP* / SSE) diretamente na mesma aplicação Fastify.
- **Vantagens:** Processo único em ambiente remoto; dispensa pacote separado.
- **Desvantagens:** Dificulta a integração local via `stdio` (padrão mais simples e amplamente suportado por ferramentas de desenvolvimento e pelo MCP Inspector) e mistura o ciclo de vida da API REST com o protocolo de agentes.

## 4. Regras de comportamento

- O servidor MCP atua apenas como interface de acesso ao WhoseFault; ele não executa diagnósticos próprios fora da `whosefault-api`.
- Erros de negócio ou segurança da API (`400`, `401`, `404`, `409`, `422`) devem ser convertidos em respostas de erro legíveis para o modelo cliente, sem mascarar falhas de segurança.
- O servidor MCP nunca deve armazenar ou registrar em logs o valor de `WHOSEFAULT_API_TOKEN` nem o conteúdo integral de evidências rejeitadas pelo guardrail.
- A definição detalhada das *Tools*, *Resources*, *Prompts*, schemas de entrada/saída e critérios de aceite será especificada na SPEC correspondente (`SPEC-09`).

## 5. Consequências

- **Positivas:**
  - Baixo acoplamento entre o protocolo MCP e a infraestrutura interna do backend.
  - Reaproveitamento integral das regras de segurança (ADR-004) e isolamento por usuário (ADR-005).
  - Possibilidade de testar e evoluir o servidor MCP de forma isolada com o MCP Inspector.
  - Caminho aberto para adicionar transporte remoto (*Streamable HTTP*) no futuro sem alterar o domínio.
- **Atenção:**
  - Tokens JWT do Firebase possuem validade curta (1 hora), o que exige renovação manual em uso contínuo até que exista um fluxo de *API Key* ou *refresh* dedicado.
  - O uso de `console.log` ou qualquer escrita acidental em `stdout` corrompe o transporte `stdio`; toda instrumentação deve usar `console.error` / `stderr`.

## 6. Fora do escopo

- Transformar o `whosefault-api` em um **MCP Client** para consumir servidores MCP externos durante o diagnóstico do Gemini.
- Suporte a transporte remoto (*Streamable HTTP* / SSE) com OAuth dinâmico na V1 do MCP.
- Upload binário de imagens (`SPEC-08`) via MCP na etapa inicial, caso não seja priorizado na SPEC-09.
- Alteração no mecanismo atual de autenticação do frontend (`whosefault-web`).

## 7. Critérios para validar a decisão

- O pacote `whosefault-mcp` não importa Prisma, Redis, Firebase Admin SDK ou adaptadores de IA.
- Todas as operações executadas via MCP respeitam o isolamento por usuário autenticado e o bloqueio de segredos (`422`/`400`) da `whosefault-api`.
- Nenhum log de execução é emitido em `stdout` durante o modo `stdio`.
- O servidor MCP conecta e responde corretamente no MCP Inspector e em pelo menos um cliente MCP local.
