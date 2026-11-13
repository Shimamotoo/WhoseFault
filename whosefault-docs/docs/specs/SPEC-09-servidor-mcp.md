# SPEC-09 — Servidor MCP (`whosefault-mcp`)

> [!NOTE]
> **Status:** Aprovado para Implementação  
> **Dependências:** Consome as APIs especificadas em [SPEC-01](SPEC-01-registrar-ocorrencia.md), [SPEC-02](SPEC-02-consultar-ocorrencias.md), [SPEC-03](SPEC-03-gerenciar-evidencias.md), [SPEC-04](SPEC-04-diagnostico-de-ia.md), [SPEC-08](SPEC-08-evidencias-em-foto.md) (leitura de imagens) e segue as decisões arquiteturais do [ADR-006](../adr/ADR-006-mcp-server.md), [ADR-004](../adr/ADR-004-seguranca-e-dados.md) e [ADR-005](../adr/ADR-005-autenticacao-e-identidade.md).

---

## 1. Objetivo

Permitir que assistentes e agentes de IA executados em IDEs ou clientes compatíveis com o **Model Context Protocol (MCP)** consultem ocorrências, registrem novas falhas e evidências textuais e solicitem diagnósticos assistidos por IA diretamente no **WhoseFault**, sem que o desenvolvedor precise sair do seu fluxo de trabalho no editor.

O servidor MCP será implementado em um novo pacote dedicado (`whosefault-mcp`) como um adaptador fino sobre a API HTTP do `whosefault-api`, utilizando o transporte `stdio` e preservando integralmente o isolamento multi-inquilino e o *Secret Guardrail*.

---

## 2. Escopo

Esta especificação contempla:

- Criação do pacote `whosefault-mcp` na raiz do monorepo em TypeScript (ESM), utilizando `@modelcontextprotocol/sdk` e `zod`.
- Inicialização do servidor MCP via transporte **`stdio`**.
- Cliente HTTP desacoplado para comunicação com a `whosefault-api`, autenticado via `WHOSEFAULT_API_TOKEN` e configurável via `WHOSEFAULT_API_URL`.
- Exposição de **6 Tools centrais**:
  - `list_occurrences`
  - `get_occurrence_details`
  - `create_occurrence`
  - `add_evidence`
  - `generate_diagnosis`
  - `get_evidence_image`
- Exposição de **2 Resources** com retorno em `application/json`:
  - `whosefault://occurrences`
  - `whosefault://occurrences/{id}`
- Exposição de **1 Prompt**:
  - `investigate_occurrence`
- Tratamento explícito e seguro de erros HTTP da API (`400`, `401`, `404`, `409`, `422`, `502`, `504`), especialmente o bloqueio por segredos detectados (`SecretDetector`).
- Suíte de testes automatizados (Vitest) para Tools, Resources, Prompts e cliente HTTP utilizando mocks/stubs (sem dependência de rede, banco de dados ou API em execução).

Não contempla:

- Qualquer alteração no código ou nos contratos do `whosefault-api` ou `whosefault-web`.
- Operações de edição ou exclusão via MCP (`PATCH`/`DELETE` de ocorrências ou evidências) e reprocessamento manual de título (`retry-title`).
- Upload de novas evidências em imagem (`IMAGE` / `SPEC-08`, `multipart/form-data`) via MCP.
- Transporte remoto (*Streamable HTTP* / SSE) ou fluxo OAuth/API Key dedicado.
- Execução do WhoseFault como MCP Client para consumir servidores MCP externos.

---

## 3. Configuração e Ciclo de Vida

### Variáveis de Ambiente
- `WHOSEFAULT_API_URL` *(opcional)*: URL base da API REST com prefixo `/api`. Valor padrão: `http://localhost:3333/api`.
- `WHOSEFAULT_API_TOKEN` *(obrigatória)*: Token Bearer (Firebase ID Token válido) enviado no cabeçalho `Authorization: Bearer <token>` em todas as requisições HTTP.

### Inicialização
- Caso `WHOSEFAULT_API_TOKEN` não esteja definido ou esteja vazio na inicialização do processo, o servidor deve registrar uma mensagem explicativa em `stderr` (sem expor segredos) e encerrar com código de saída diferente de zero (`process.exit(1)`).
- A URL configurada em `WHOSEFAULT_API_URL` deve ter barras finais excedentes normalizadas antes da composição dos caminhos.

---

## 4. Requisitos Funcionais

### RF-01 — Tool `list_occurrences`
- **Descrição para o modelo:** Lista as ocorrências de falha de API pertencentes ao usuário autenticado, ordenadas da mais recente para a mais antiga.
- **Schema de entrada (`zod`):** Nenhum parâmetro obrigatório (objeto vazio `{}`).
- **Integração HTTP:** `GET /occurrences`.
- **Saída:** Retorna o JSON da lista de ocorrências (`id`, `apiName`, `method`, `url`, `title`, `description`, `createdAt`, `updatedAt`) em `content` do tipo `text`.

### RF-02 — Tool `get_occurrence_details`
- **Descrição para o modelo:** Obtém os detalhes completos de uma ocorrência, incluindo suas evidências registradas e o último diagnóstico gerado pela IA (quando existir).
- **Schema de entrada (`zod`):**
  - `occurrenceId`: `string` não vazia (UUID da ocorrência).
- **Integração HTTP:**
  1. `GET /occurrences/:occurrenceId`
  2. `GET /occurrences/:occurrenceId/evidences`
  3. `GET /occurrences/:occurrenceId/diagnosis`
- **Regra de diagnóstico ausente:** Se o endpoint `/diagnosis` retornar `HTTP 404`, o servidor MCP **não** deve falhar a tool; deve retornar `diagnosis: null` no objeto consolidado.
- **Saída:** JSON consolidado `{ occurrence, evidences, diagnosis }`.

### RF-03 — Tool `create_occurrence`
- **Descrição para o modelo:** Registra uma nova ocorrência de erro ou comportamento inesperado de integração com API.
- **Schema de entrada (`zod`):**
  - `apiName`: `string` não vazia.
  - `method`: enum `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'`.
  - `url`: `string` (URL válida `http://` ou `https://`).
  - `description`: `string` opcional (descrição do problema observado).
- **Integração HTTP:** `POST /occurrences` com `{ apiName, method, url, description }`.
- **Saída:** JSON com a ocorrência criada (`201 Created`), incluindo o `id` gerado e o título inicial.

### RF-04 — Tool `add_evidence`
- **Descrição para o modelo:** Adiciona uma evidência técnica textual (`HTTP_REQUEST`, `HTTP_RESPONSE`, `ERROR_LOG` ou `MANUAL_NOTE`) a uma ocorrência existente. Nunca envie credenciais, tokens JWT, chaves de API ou senhas reais; mascare valores sensíveis antes de enviar.
- **Schema de entrada (`zod`):**
  - `occurrenceId`: `string` não vazia.
  - `type`: enum `'HTTP_REQUEST' | 'HTTP_RESPONSE' | 'ERROR_LOG' | 'MANUAL_NOTE'`.
  - `method`: enum HTTP opcional (aplicável a `HTTP_REQUEST`).
  - `url`: `string` opcional (aplicável a `HTTP_REQUEST`).
  - `statusCode`: `number` inteiro entre `100` e `599` opcional (aplicável a `HTTP_RESPONSE`).
  - `headers`: `Record<string, string>` opcional (aplicável a `HTTP_REQUEST` e `HTTP_RESPONSE`).
  - `payload`: `string` opcional (corpo enviado em `HTTP_REQUEST`).
  - `body`: `string` opcional (corpo recebido em `HTTP_RESPONSE`).
  - `content`: `string` opcional (texto principal em `ERROR_LOG` e `MANUAL_NOTE`).
  - `context`: `string` opcional (contexto adicional em `ERROR_LOG`).
  - `notes`: `string` opcional (observações adicionais em `HTTP_REQUEST` e `HTTP_RESPONSE`).
- **Validação contextual no schema/tool:** Validar previamente (ou via `superRefine` no Zod) a presença dos campos mínimos esperados por tipo para orientar o modelo antes mesmo da chamada HTTP:
  - `HTTP_REQUEST`: exige `method` e `url`.
  - `HTTP_RESPONSE`: exige `statusCode`.
  - `ERROR_LOG` e `MANUAL_NOTE`: exigem `content`.
- **Integração HTTP:** `POST /occurrences/:occurrenceId/evidences` enviando apenas os campos relevantes ao payload JSON.
- **Saída:** JSON da evidência criada (`201 Created`).

### RF-05 — Tool `generate_diagnosis`
- **Descrição para o modelo:** Solicita à IA do WhoseFault a geração (ou atualização) de um diagnóstico estruturado para a ocorrência com base nas suas evidências cadastradas.
- **Schema de entrada (`zod`):**
  - `occurrenceId`: `string` não vazia.
- **Integração HTTP:** `POST /occurrences/:occurrenceId/diagnosis`.
- **Saída:** JSON do diagnóstico gerado (`factsObserved`, `hypotheses`, `missingInformation`, `isOutdated`, `generatedAt`, etc.).

### RF-06 — Tool `get_evidence_image`
- **Descrição para o modelo:** Obtém o conteúdo visual de uma evidência do tipo `IMAGE` associada a uma ocorrência para análise multimodal pelo assistente.
- **Schema de entrada (`zod`):**
  - `occurrenceId`: `string` não vazia (UUID da ocorrência).
  - `evidenceId`: `string` não vazia (UUID da evidência).
- **Integração HTTP:** `GET /occurrences/:occurrenceId/evidences/:evidenceId/image`.
- **Saída:** Retorna conteúdo multimodal MCP no formato `{ type: "image", data: "<base64>", mimeType }`, convertendo o buffer binário retornado pela API para Base64 e preservando o `Content-Type` recebido (`image/jpeg`, `image/png` ou `image/webp`).
- **Erros específicos:** Caso a evidência não seja do tipo `IMAGE` (`HTTP 400`), não exista (`HTTP 404`) ou haja falha no provedor de storage (`HTTP 502`), retornar `isError: true` com a mensagem clara da API.

### RF-07 — Tratamento de Erros de Negócio, Segurança e Transporte
Todas as *Tools* devem capturar falhas da API e retornar resultado MCP com `isError: true` e mensagem acionável para o modelo cliente:
- **`HTTP 422` (Secret Guardrail na criação de evidência) / `HTTP 400` com `fields` (Double-check no diagnóstico):**
  - Retornar o alerta de segurança (`error`), a orientação (`guidance`) e a lista de campos sinalizados (`fields`) retornados pela API, instruindo explicitamente o agente a **mascarar os segredos** (ex.: `[REDACTED]`) ou solicitar revisão ao usuário antes de tentar novamente.
- **`HTTP 401` (Token inválido/expirado ou acesso negado):**
  - Informar claramente que a autenticação falhou e que o `WHOSEFAULT_API_TOKEN` pode estar expirado ou inválido.
- **`HTTP 404` (Ocorrência não encontrada):**
  - Informar que o `occurrenceId` não foi encontrado para o usuário autenticado.
- **`HTTP 409` (Conflito de concorrência no diagnóstico):**
  - Informar que a ocorrência ou suas evidências foram modificadas durante o processamento e orientar que a operação pode ser solicitada novamente.
- **`HTTP 502` / `HTTP 504` / Falha de rede (API offline):**
  - Informar indisponibilidade ou timeout do provedor de IA / `whosefault-api` sem derrubar o servidor MCP.

### RF-08 — Resources MCP (`application/json`)
O servidor deve registrar dois recursos de leitura:
1. **Resource estático `whosefault://occurrences`** (`mimeType: "application/json"`):
   - Consulta `GET /occurrences` e retorna o JSON da listagem.
2. **Resource template `whosefault://occurrences/{id}`** (`mimeType: "application/json"`):
   - Executa o mesmo fluxo consolidado de leitura (`occurrence`, `evidences`, `diagnosis` com `404 -> null`) e retorna o JSON estruturado correspondente ao `{id}`.
   - Caso a ocorrência `{id}` não exista ou o usuário não tenha acesso, deve propagar erro MCP apropriado.

### RF-09 — Prompt MCP `investigate_occurrence`
- **Nome:** `investigate_occurrence`
- **Argumentos:**
  - `occurrenceId` (`string`, obrigatório): ID da ocorrência a ser investigada.
- **Comportamento:** Retorna uma mensagem de instrução (`role: "user"`) orientando o assistente conectado a:
  1. Ler os detalhes completos da ocorrência via `get_occurrence_details` (ou resource `whosefault://occurrences/{id}`).
  2. Analisar fatos observados, hipóteses e informações faltantes (solicitando `generate_diagnosis` caso ainda não exista diagnóstico atualizado).
  3. Cruzar os dados da requisição, resposta e logs da ocorrência com o código-fonte do workspace do usuário para apontar a causa provável e sugerir correções.

---

## 5. Requisitos Não Funcionais e Arquitetura

### RNF-01 — Estrutura e Isolamento do Pacote (`ADR-006`)
- O pacote deve residir em `whosefault-mcp/` na raiz do monorepo, com `package.json`, `tsconfig.json` e `vitest.config.ts` próprios.
- Estrutura sugerida em `whosefault-mcp/src/`:
  - `index.ts`: leitura e validação de variáveis de ambiente, instanciação do `McpServer` e conexão com `StdioServerTransport`.
  - `client.ts`: cliente HTTP (`WhoseFaultClient`) encapsulando `fetch`, cabeçalho `Authorization`, parsing de respostas e erros tipados.
  - `tools.ts`: registro das 6 tools e schemas Zod.
  - `resources.ts`: registro dos 2 resources (`whosefault://occurrences` e template `whosefault://occurrences/{id}`).
  - `prompts.ts`: registro do prompt `investigate_occurrence`.
- O pacote **não** deve importar nenhum módulo de `whosefault-api` (nem Prisma, BullMQ, Redis, Firebase Admin ou SDK Gemini).

### RNF-02 — Integridade do Canal `stdio`
- Em hipótese alguma `console.log` ou escritas diretas em `process.stdout` podem ser executadas fora do transporte MCP.
- Todo log operacional ou de erro deve usar `console.error` / `process.stderr`.

### RNF-03 — Segurança de Credenciais e Conteúdos Sensíveis (`ADR-004`)
- O valor de `WHOSEFAULT_API_TOKEN` nunca deve ser impresso em `stderr`, retornado em mensagens de erro de tools ou incluído em respostas de resources.
- Em erros `422`/`400` de detecção de segredos, o `whosefault-mcp` deve repassar apenas as mensagens e nomes de campos retornados pela API, sem registrar payloads recebidos em logs.

### RNF-04 — Testabilidade Offline
- A suíte de testes (`npm test` dentro de `whosefault-mcp`) deve rodar 100% offline com Vitest, injetando um mock/stub de `fetch` (ou interface `WhoseFaultClient`) para testar:
  - Registro e execução das 6 tools (sucesso, retorno multimodal de imagem e erros `400`, `401`, `404`, `409`, `422`, `502`/`504`).
  - Validações Zod de entrada (ex.: `add_evidence` sem campos obrigatórios para o `type` selecionado).
  - Leitura dos 2 resources (incluindo fallback `diagnosis: null` quando `/diagnosis` responde `404`).
  - Geração do prompt `investigate_occurrence`.

---

## 6. Critérios de Aceitação

### CA-01 — Inicialização e Falha Rápida sem Token
**Dado que** `WHOSEFAULT_API_TOKEN` não está definido no ambiente,  
**quando** o binário do `whosefault-mcp` for iniciado,  
**então** ele deve emitir erro claro em `stderr` (sem vazar dados sensíveis) e encerrar com código de saída diferente de `0`.

### CA-02 — Listagem e Detalhamento via Tools
**Dado que** o `whosefault-api` possui ocorrências para o usuário do token configurado,  
**quando** o cliente MCP chamar `list_occurrences` e em seguida `get_occurrence_details` para um ID válido sem diagnóstico prévio,  
**então** a listagem deve retornar as ocorrências e os detalhes devem retornar `{ occurrence, evidences, diagnosis: null }` sem erro.

### CA-03 — Criação de Ocorrência e Evidência Textual
**Dado que** o usuário pede ao agente para registrar uma falha de API,  
**quando** o agente invocar `create_occurrence` e posteriormente `add_evidence` com `type: "HTTP_RESPONSE"` e `statusCode: 502`,  
**então** a API deve persistir ambos os registros e as tools devem retornar os objetos criados em JSON.

### CA-04 — Repasse do Secret Guardrail (`HTTP 422`)
**Dado que** uma chamada a `add_evidence` contém uma credencial detectável (ex.: `Authorization: Bearer eyJ...`),  
**quando** a `whosefault-api` responder `HTTP 422`,  
**então** a tool deve retornar `isError: true` contendo a orientação de segurança e os campos afetados (`fields`), permitindo que o agente mascare os segredos antes de reenviar.

### CA-05 — Geração de Diagnóstico e Tratamento de Concorrência
**Dado que** existe uma ocorrência com evidências válidas,  
**quando** o cliente MCP chamar `generate_diagnosis`,  
**então** deve receber o diagnóstico estruturado (`factsObserved`, `hypotheses`, `missingInformation`); caso a API responda `409`, a tool deve retornar `isError: true` explicando o conflito de concorrência.

### CA-06 — Leitura de Resources em JSON
**Dado que** o cliente MCP lê `whosefault://occurrences` ou `whosefault://occurrences/{id}`,  
**quando** o servidor processar a leitura,  
**então** deve retornar conteúdo com `mimeType: "application/json"` contendo os dados atualizados vindos da `whosefault-api`.

### CA-07 — Prompt `investigate_occurrence`
**Dado que** o cliente MCP solicita o prompt `investigate_occurrence` informando `occurrenceId`,  
**quando** o servidor responder,  
**então** deve retornar o roteiro de investigação referenciando o ID informado e as tools/resources do WhoseFault.

### CA-08 — Leitura Multimodal de Evidência em Imagem
**Dado que** uma ocorrência possui uma evidência do tipo `IMAGE` armazenada na API,  
**quando** o cliente MCP chamar `get_evidence_image` informando `occurrenceId` e `evidenceId`,  
**então** a tool deve retornar um item de conteúdo MCP com `type: "image"`, `mimeType` compatível e `data` em Base64 válido; caso a evidência seja textual (`HTTP 400`), deve retornar `isError: true`.

### CA-09 — Validação em Testes Automatizados e MCP Inspector
**Dado que** o desenvolvedor executa `npm test` em `whosefault-mcp`,  
**quando** a suíte Vitest rodar offline,  
**então** todos os testes devem passar; e ao executar o servidor via `npx @modelcontextprotocol/inspector` conectado a uma instância local da `whosefault-api`, todas as 6 tools, 2 resources e 1 prompt devem ser listáveis e executáveis sem corromper o canal `stdio`.
