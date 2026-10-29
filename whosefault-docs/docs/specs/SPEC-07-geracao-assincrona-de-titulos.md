# SPEC-07 — Processamento Assíncrono de Títulos com Mensageria

> [!NOTE]
> **Status:** Aprovado para Implementação  
> **Dependências:** Estende e aditiva o comportamento de entrega de títulos previsto nas especificações SPEC-01 (RF-03, CA-05, CA-10) e ADR-001 / ADR-003.

---

## 1. Objetivo

Eliminar a latência percebida pelo usuário (bloqueio de 3 a 5 segundos) durante a criação e a primeira edição de descrição de ocorrências, desacoplando a chamada ao provedor de IA por meio de processamento em segundo plano orientado a fila (Redis + BullMQ).

A API deve persistir a ocorrência imediatamente com o título genérico padrão e responder ao cliente em milissegundos, delegando a geração e a atualização do título para um worker assíncrono resiliente com retentativas automáticas e controle de taxa.

---

## 2. Escopo

Esta especificação contempla:

- Infraestrutura do broker de mensagens com Redis no Docker Compose (`redis:alpine`).
- Definição do contrato abstrato de mensageria (`ITitleQueue`) na camada de aplicação/serviços e implementação concreta com BullMQ na camada de infraestrutura (`src/infra/queue`).
- Disponibilização de `StubTitleQueue` / `InMemoryTitleQueue` para que a suíte de testes (Vitest) continue executando sem necessidade de conexão com o Redis.
- Enfileiramento de jobs de geração de título na criação de ocorrências com descrição (`POST /occurrences`) e na primeira inclusão de descrição via edição (`PATCH /occurrences/:id`).
- Ciclo de vida do worker do BullMQ executado no mesmo processo da API Fastify, com graceful shutdown coordenado.
- Política de resiliência: 3 tentativas com backoff exponencial em caso de falhas da IA. Em caso de falha definitiva, a ocorrência permanece com `Ocorrência sem descrição`, mantendo habilitada a ação manual de retry (`POST /occurrences/:id/retry-title`).
- Controle de concorrência e vazão no worker (2 a 5 jobs simultâneos) para respeitar quotas de taxa (RPM) da API de IA.
- Estratégia de polling curto temporário no front-end para atualização do título sem recarregamento manual da página.

Não contempla:
- Alterações no schema do banco de dados (Prisma).
- Processamento assíncrono de diagnósticos da IA (escopo futuro).
- Notificações bidirecionais via WebSockets ou Server-Sent Events (SSE).

---

## 3. Requisitos Funcionais

### RF-01 — Resposta Imediata na Criação de Ocorrência (POST /occurrences)
- Ao receber a requisição com dados válidos, o sistema deve salvar imediatamente a ocorrência no banco com o título padrão `Ocorrência sem descrição`.
- Se o campo `description` estiver preenchido, o sistema deve despachar um job assíncrono para a fila `title-generation` contendo `{ occurrenceId, description }`.
- O endpoint deve responder com HTTP `201 Created` e os dados da ocorrência salva imediatamente, sem aguardar a conclusão da IA.

### RF-02 — Resposta Imediata na Primeira Inclusão de Descrição (PATCH /occurrences/:id)
- Ao receber uma edição onde a ocorrência previamente não possuía descrição e uma descrição válida é informada, o sistema deve atualizar os dados no banco preservando o título atual.
- O sistema deve enfileirar o job de geração de título `{ occurrenceId, description }` na fila `title-generation`.
- O endpoint deve responder com HTTP `200 OK` imediatamente.

### RF-03 — Worker de Geração e Atualização de Títulos
- O worker deve consumir jobs da fila `title-generation`.
- Para cada job, o worker deve chamar o serviço `ITitleGenerator.generate(description)`.
- Se a IA retornar um título válido, o worker deve atualizar a ocorrência correspondente via repositório (`occurrenceRepository.update`).
- Se a IA retornar vazio ou falhar após todas as tentativas, a ocorrência permanece inalterada com `Ocorrência sem descrição`.

### RF-04 — Política de Retentativas e Resiliência
- O job na fila do BullMQ deve ser configurado com até 3 tentativas (`attempts: 3`).
- Deve ser aplicado backoff exponencial entre as tentativas (ex: 2s, 4s, 8s).
- Falhas permanentes não devem derrubar o processo do worker nem gerar inconsistência no banco de dados.

### RF-05 — Controle de Concorrência e Rate Limiting
- O worker deve operar com concorrência configurável (padrão: 3 conexões simultâneas) para não sobrecarregar as quotas de requisições por minuto (RPM) da API de IA.

### RF-06 — Feedback e Atualização no Front-end
- Após a criação com sucesso ou edição, a interface deve exibir a ocorrência de imediato.
- O front-end deve disparar um polling curto (2 a 3 tentativas a cada 2 segundos) consultando o endpoint `GET /occurrences/:id` ou a listagem até que o título seja atualizado ou expire o tempo limite.

---

## 4. Requisitos Não Funcionais e Arquitetura

### RNF-01 — Isolamento Arquitetural (ADR-001)
- Casos de uso (`createOccurrence` e `updateOccurrence`) não devem importar diretamente o SDK do `bullmq` nem o driver do `redis`.
- O envio à fila deve ocorrer por meio de uma interface abstrata:
  ```typescript
  export interface ITitleQueue {
    enqueue(data: { occurrenceId: string; description: string }): Promise<void>;
  }
  ```
- A implementação concreta `BullMQTitleQueue` deve residir em `src/infra/queue/bullmqTitleQueue.ts`.

### RNF-02 — Independência de Testes Automatizados
- A suíte de testes do Vitest deve utilizar uma implementação `StubTitleQueue` / `InMemoryTitleQueue`, assegurando que `npm test` execute 100% offline sem falhas decorrentes da ausência do container Redis.

### RNF-03 — Infraestrutura no Docker Compose
- O arquivo `docker-compose.yml` deve incluir o serviço `redis:alpine` com healthcheck configurado e rede integrada aos demais serviços.

---

## 5. Critérios de Aceitação

### CA-01 — Criação Não Bloqueante com Descrição
**Dado que** o desenvolvedor enviou uma requisição válida `POST /occurrences` com descrição,  
**quando** a ocorrência for persistida,  
**então** a API deve responder `201 Created` em menos de 150ms com o título `Ocorrência sem descrição`, e o job deve ser registrado na fila.

### CA-02 — Não Enfileirar sem Descrição
**Dado que** uma ocorrência é criada sem descrição,  
**quando** a API salvar o registro,  
**então** nenhum job deve ser despachado para a fila de títulos.

### CA-03 — Atualização Assíncrona com Sucesso
**Dado que** um job de título foi enfileirado com sucesso,  
**quando** o worker processar o job e a IA retornar um título curto utilizável,  
**então** o banco de dados deve refletir o novo título da ocorrência e registrar a data de atualização.

### CA-04 — Resiliência em Caso de Falha da IA
**Dado que** o provedor de IA está instável ou indisponível,  
**quando** o worker esgotar as 3 tentativas de reprocessamento,  
**então** o job deve ser marcado como falho, o título deve permanecer como `Ocorrência sem descrição` e a ação manual de retry (`POST /occurrences/:id/retry-title`) deve continuar funcional.

### CA-05 — Execução Isolada de Testes
**Dado que** o desenvolvedor executa `npm run test` sem containers Redis ativos,  
**quando** a suíte do Vitest rodar,  
**então** todos os testes unitários e de integração in-memory devem passar com sucesso utilizando stubs.

### CA-06 — Atualização Visível no Front-end
**Dado que** o usuário registrou uma ocorrência com descrição no modal,  
**quando** o modal fechar instantaneamente,  
**então** o título definitivo gerado pela IA deve ser refletido na tela em poucos segundos através do polling de atualização.
