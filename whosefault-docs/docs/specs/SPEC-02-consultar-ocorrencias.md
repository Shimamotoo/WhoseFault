# SPEC-02 — Consultar ocorrências

## 1. Objetivo

Permitir que o desenvolvedor consulte as ocorrências registradas no WhoseFault, identifique rapidamente cada problema e acesse os detalhes de uma ocorrência específica.

## 2. Escopo

Esta especificação contempla:

- Listar as ocorrências registradas.
- Ordenar a listagem por data de criação.
- Exibir informações resumidas de cada ocorrência.
- Permitir o acesso aos detalhes de uma ocorrência.

Não contempla pesquisa, filtros, paginação ou gerenciamento do processo de investigação.

## 3. Requisitos funcionais

### RF-01 — Listar ocorrências

O sistema deve apresentar as ocorrências registradas pelo desenvolvedor.

Cada ocorrência deve aparecer como um item identificável na listagem.

### RF-02 — Ordenar por data de criação

O sistema deve ordenar as ocorrências da mais recente para a mais antiga, considerando a data e o horário de criação.

A edição de uma ocorrência não deve alterar sua posição na listagem, pois a ordenação utiliza a data de criação, e não a data da última edição.

### RF-03 — Exibir informações resumidas

Cada item da listagem deve apresentar:

- Nome ou identificador da API.
- Método HTTP e URL pretendida.
- Título atual da ocorrência.

O título deve corresponder ao título armazenado na ocorrência, seja ele gerado pela IA ou o título genérico `Ocorrência sem descrição`.

### RF-04 — Consultar detalhes

O sistema deve permitir que o desenvolvedor selecione uma ocorrência da listagem e acesse seus detalhes.

A visualização detalhada deve apresentar as informações definidas na SPEC-01 — Registrar ocorrência.

### RF-05 — Listagem vazia

Quando não houver ocorrências registradas, o sistema deve apresentar uma indicação de que nenhuma ocorrência foi cadastrada.

A interface deve permitir que o desenvolvedor inicie o fluxo de criação de uma ocorrência.

## 4. Regras de negócio

### RN-01 — Ordenação

A ordenação padrão deve ser decrescente pela data e horário de criação.

### RN-02 — Posição estável após edição

Alterações em uma ocorrência não devem modificar sua posição relativa na listagem, exceto quando uma nova ocorrência for criada.

### RN-03 — Título exibido

A listagem deve exibir o título atualmente armazenado.

Quando não houver título gerado com sucesso, deve ser exibido o título genérico `Ocorrência sem descrição`, conforme a SPEC-01.

### RN-04 — Uso individual na V1

A V1 será direcionada ao uso individual. A listagem deve apresentar as ocorrências pertencentes ao usuário autenticado, caso a autenticação faça parte do escopo definido para a versão.

Os detalhes de autenticação e autorização deverão ser definidos nas especificações pertinentes antes da implementação.

## 5. Critérios de aceitação

### CA-01 — Exibir ocorrências registradas

**Dado que** existem ocorrências registradas,

**quando** o desenvolvedor acessar a listagem,

**então** o sistema deve apresentar as ocorrências com as informações resumidas definidas nesta especificação.

### CA-02 — Ordenar da mais recente para a mais antiga

**Dado que** existem várias ocorrências criadas em momentos diferentes,

**quando** o desenvolvedor acessar a listagem,

**então** as ocorrências devem ser apresentadas da mais recente para a mais antiga.

### CA-03 — Preservar a posição após edição

**Dado que** uma ocorrência foi editada,

**quando** o desenvolvedor consultar novamente a listagem,

**então** a ocorrência deve manter sua posição determinada pela data e horário de criação.

### CA-04 — Exibir o título atual

**Dado que** uma ocorrência possui um título gerado ou um título genérico,

**quando** for exibida na listagem,

**então** o sistema deve apresentar o título atualmente armazenado.

### CA-05 — Acessar detalhes

**Dado que** uma ocorrência aparece na listagem,

**quando** o desenvolvedor selecioná-la,

**então** o sistema deve apresentar os detalhes correspondentes à ocorrência selecionada.

### CA-06 — Exibir estado vazio

**Dado que** não existem ocorrências registradas,

**quando** o desenvolvedor acessar a listagem,

**então** o sistema deve informar que não há ocorrências cadastradas e oferecer acesso ao fluxo de criação.

## 6. Fora do escopo

- Pesquisa por nome, método HTTP, URL, descrição ou título.
- Filtros.
- Paginação.
- Ordenação escolhida pelo usuário.
- Exibição de estado ou resultado da investigação.
- Colaboração entre usuários.
- Gestão completa de evidências.
- Diagnóstico de ocorrências por IA.

## 7. Pontos a definir antes da implementação

- Estratégia de carregamento da listagem e tratamento de erros.
- Comportamento visual durante o carregamento.
- Estratégia de paginação, caso seja necessária em uma versão futura.
- Regras de autenticação e autorização, conforme o escopo de segurança definido para a V1.