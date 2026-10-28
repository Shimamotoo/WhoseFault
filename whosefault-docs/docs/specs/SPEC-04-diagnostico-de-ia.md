# SPEC-04 — Solicitar diagnóstico por IA

> [!NOTE]
> **Status:** Entregue e Consolidado na V1  
> **Observação pós-V1:** O escopo original da V1 não contemplava autenticação de usuários; a associação de ocorrências a usuários autenticados e o isolamento multi-inquilino foram introduzidos nas especificações SPEC-05 e SPEC-06.



## 1. Objetivo

Permitir que o desenvolvedor solicite uma análise das evidências de uma ocorrência, utilizando inteligência artificial para identificar fatos, levantar hipóteses fundamentadas sobre a causa de erros e apontar informações faltantes que podem ajudar na investigação.

O diagnóstico atua como um assistente de análise estruturada e não modifica os dados originais da ocorrência. O processo deve garantir a proteção de dados sensíveis e a consistência relacional entre ocorrências e evidências, conforme estabelecido no Modelo de Domínio e nas ADRs.

## 2. Escopo

Esta especificação contempla:

- Solicitar a geração de um diagnóstico para uma ocorrência específica.
- Bloquear a interface da ocorrência durante o processamento.
- Enviar automaticamente o contexto completo (todas as evidências disponíveis) da ocorrência para a IA.
- Garantir a proteção de credenciais antes do envio ao provedor de IA (double-check).
- Processar, validar estruturalmente (via Zod) e persistir (em JSONB via UPSERT) o resultado da IA.
- Controlar o estado de atualização do diagnóstico (atualizado vs. desatualizado).
- Tratar falhas de validação estrutural (schema mismatch), concorrência de atualização e timeout do provedor.
- Consultar um diagnóstico já existente.

Não contempla a execução de requisições autônomas pela IA, edição manual do resultado gerado pelo usuário, ou criação de histórico de versões de diagnósticos (Versionamento).

## 3. Requisitos funcionais

### RF-01 — Solicitar geração de diagnóstico

O sistema deve permitir que o desenvolvedor solicite a análise de uma ocorrência por meio de uma ação explícita (gatilho).
Ao acionar o gatilho, a interface do usuário correspondente à ocorrência deve ser desabilitada (disabled state) e exibir um indicador visual de carregamento (spinner).

### RF-02 — Preparar contexto de análise

O sistema deve reunir automaticamente todas as evidências cadastradas na ocorrência e seus metadados (como URL e Método HTTP) para formar o contexto da análise.
O desenvolvedor não precisa selecionar manualmente quais evidências serão enviadas na V1.

### RF-03 — Double-check de Segurança (ADR-004)

Antes de realizar a requisição externa para a IA, o backend deve executar uma verificação de segurança (double-check) sobre todo o contexto reunido.

Caso seja detectado um padrão correspondente a dados sensíveis, a requisição externa não deve ser efetuada. O sistema deve abortar o fluxo e retornar um erro orientando o usuário a revisar as evidências.

### RF-04 — Interação e Validação de Contrato (IA)

O backend deve requisitar a análise ao provedor de IA exigindo um formato de resposta JSON estruturado.

O resultado retornado pela IA deve ser validado estruturalmente (por exemplo, utilizando Zod) contra o seguinte schema:

- facts_observed (Array de strings): Fatos concretos observados nas evidências.
- hypotheses (Array de objetos): Contendo cause (a hipótese da causa do erro) e evidence_support (quais evidências sustentam a hipótese).
- missing_information (Array de strings): Informações vitais que não estão presentes nas evidências e que limitam a conclusão.

### RF-05 — Persistir Diagnóstico Válido (UPSERT)

Se a resposta da IA for válida estruturalmente e a ocorrência mantiver-se inalterada durante o processamento (ver RF-06), o sistema deve salvar o diagnóstico vinculado à ocorrência utilizando a operação de UPSERT (inserir se não existir, atualizar se existir).

O contexto enviado (snapshot) e o resultado validado devem ser armazenados em formato JSONB.

O estado inicial do diagnóstico salvo será marcado como atualizado (is_outdated = false).

### RF-06 — Controle de Concorrência e Consistência (DI-12)
O sistema deve garantir que o diagnóstico só seja salvo se os dados de origem não tiverem sido alterados (ex: uma evidência excluída em outra aba) durante o tempo de resposta da IA.

O backend deve comparar o estado de atualização (ex: maior updated_at entre ocorrência e evidências) capturado antes da chamada à IA com o estado atual logo antes da persistência.

Se houver divergência, o resultado da IA deve ser descartado, sem sobrescrever ou salvar.

### RF-07 — Gerenciar Estado Desatualizado
Sempre que ocorrer uma adição, edição ou exclusão de qualquer evidência associada, ou alteração nos dados principais da ocorrência (exceto o título), o sistema deve marcar o diagnóstico existente (se houver) como desatualizado (is_outdated = true).

Esse controle de estado deve ser persistido ativamente no banco de dados no momento da alteração.

O diagnóstico desatualizado permanecerá visível para o usuário, mas com um alerta visual claro de que não representa o cenário atual das evidências.

### RF-08 — Consultar Diagnóstico

O sistema deve permitir a consulta do diagnóstico salvo para uma ocorrência.

O frontend deve exibir os fatos observados, as hipóteses (com seus respectivos suportes de evidência), as informações faltantes e o estado atualizado/desatualizado do diagnóstico.

### RF-09 — Tratamento de Falhas (Timeout e Mismatch)

Se o provedor de IA não responder dentro de um tempo limite aceitável (ex: 45s a 60s), o backend deve cancelar a requisição e retornar erro.

Se a resposta da IA for estruturalmente inválida (schema mismatch reprovado pelo Zod), o backend deve tratar como falha de geração.

Em ambos os casos, a interface deve ser desbloqueada, um aviso de erro deve ser exibido ao usuário e, se existir um diagnóstico salvo anteriormente, ele deve ser preservado.

## 4. Regras de negócio

### RN-01 — Entidade Própria e Relacionamento 1:1

O diagnóstico é uma entidade independente no banco de dados, relacionada 1:1 com a ocorrência. Não haverá histórico ou múltiplas versões de diagnóstico para a mesma ocorrência simultaneamente.

### RN-02 — Contexto Obrigatório em JSONB

A persistência do diagnóstico deve obrigatoriamente armazenar em uma coluna de tipo JSONB a cópia exata do contexto submetido à IA (snapshot), para fins de auditoria, consistência e para garantir que alterações futuras não mudem a história do que foi analisado.

### RN-03 — Responsabilidade de Proteção

A detecção tardia de segredos (double-check) deve abortar o processo imediatamente (retornando erro HTTP 400 - Bad Request). Não haverá mascaramento automático de credenciais antes do envio para a IA; a responsabilidade de sanitizar a evidência é do usuário.

### RN-04 — Prioridade da Consistência de Dados

Caso a regra de concorrência detecte mudanças nos dados da ocorrência durante o processamento da IA, a operação de salvamento é descartada. A integridade dos dados da investigação tem precedência absoluta sobre o resultado da IA.

## 5. Critérios de aceitação

### CA-01 — Solicitar com Sucesso

**Dado que** o gatilho foi acionado sem segredos nas evidências,

**quando** a IA retornar resposta válida no schema,

**então** o sistema executa o UPSERT, marca is_outdated = false e exibe o resultado.

### CA-02 — Bloqueio por Dados Sensíveis

**Dado que** o gatilho foi acionado, 

**quando** o double-check detectar credencial/segredo nas evidências,

**então** a chamada externa é cancelada, a UI é destravada e um erro de revisão é exibido.

### CA-03 — Falha Estrutural (Mismatch)

**Dado que** a IA respondeu à requisição, 

**quando** o JSON retornado falhar na validação do Zod,

**então** o backend não salva a resposta, preserva o diagnóstico antigo e alerta o usuário.

### CA-04 — Concorrência (Descarte)

**Dado que** o diagnóstico está em processamento, 

**quando** uma evidência for alterada/removida em paralelo,

**então** o backend descarta o payload retornado pela IA e não altera o banco de dados.

### CA-05 — Marcação de Desatualizado

**Dado que** existe um diagnóstico atualizado, 

**quando** uma evidência for editada ou adicionada,

**então** o banco atualiza para is_outdated = true e a UI exibe um alerta de desatualização.

### CA-06 — Limite de Timeout

**Dado que** a requisição foi enviada à IA, 

**quando** o tempo limite (ex: 45s) for excedido,

**então** o backend aborta a conexão, a UI é desbloqueada e informa o timeout.

## 6. Fora do escopo
- Seleção manual de evidências a serem enviadas; o envio automático abrangerá todas.
- Versionamento e histórico de diagnósticos passados na mesma ocorrência.
- Edição manual dos campos de resultado (fatos e hipóteses) gerados pela IA.
- Determinação e definição de status ou diagnóstico "raiz" absoluto pela IA (o foco é assistência e levantamento de hipóteses estruturadas).