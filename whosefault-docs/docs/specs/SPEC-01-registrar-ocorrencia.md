# SPEC-01 — Registrar ocorrência

> [!NOTE]
> **Status:** Entregue e Consolidado na V1  
> **Observação pós-V1:** O escopo original da V1 não contemplava autenticação de usuários; a associação de ocorrências a usuários autenticados e o isolamento multi-inquilino foram introduzidos nas especificações SPEC-05 e SPEC-06.



## 1. Objetivo

Permitir que o desenvolvedor registre uma ocorrência relacionada a erros ou comportamentos inesperados durante a integração com uma API, reúna as informações disponíveis e consulte ou edite esses dados posteriormente.

O registro deve ser independente da disponibilidade da inteligência artificial. A IA poderá auxiliar na geração de um título curto a partir da descrição fornecida, mas uma falha nessa operação não deverá impedir a criação ou a edição da ocorrência.

## 2. Escopo

Esta especificação contempla:

- Criar uma ocorrência.
- Validar os dados obrigatórios e os formatos aceitos.
- Gerar automaticamente um título curto com auxílio de IA quando houver descrição.
- Utilizar um título genérico quando a geração não for possível.
- Consultar os detalhes de uma ocorrência.
- Editar as informações permitidas.
- Solicitar manualmente uma nova tentativa de geração de título.
- Permitir o registro de ocorrências mesmo quando ainda não houver uma resposta HTTP ou detalhes técnicos disponíveis.

Não contempla a listagem, a pesquisa ou a filtragem de ocorrências, definidas em outras especificações, nem a investigação diagnóstica completa por IA.

## 3. Requisitos funcionais

### RF-01 — Criar ocorrência

O sistema deve permitir que o desenvolvedor crie uma ocorrência informando:

- Nome ou identificador da API.
- URL pretendida da requisição.
- Método HTTP pretendido.
- Descrição do problema (opcional).

O sistema deve permitir a criação mesmo quando não houver descrição ou informações técnicas da requisição.

### RF-02 — Registrar informações técnicas

O sistema deve permitir que o desenvolvedor informe, opcionalmente, dados técnicos relacionados à ocorrência, como:

- Status HTTP.
- Payload da requisição.
- Resposta recebida.
- Mensagem de erro.
- Informações sobre autenticação, desde que não contenham credenciais ou outros dados sensíveis.

A ausência dessas informações não deve impedir a criação da ocorrência.

### RF-03 — Gerar título automaticamente

O sistema deve utilizar a descrição fornecida para solicitar à IA a geração de um título curto que represente o problema registrado.

A geração automática deve ocorrer somente nas seguintes situações:

- Durante a criação de uma ocorrência que possui descrição.
- Quando uma descrição é adicionada pela primeira vez a uma ocorrência criada sem descrição.

A edição posterior de uma descrição existente não deve disparar uma nova geração automática, mesmo quando o título atual for genérico devido a uma falha anterior.

O título gerado deve ser armazenado separadamente da descrição original.

### RF-04 — Utilizar título genérico

Quando a ocorrência não possuir descrição ou quando a geração automática falhar ou retornar um resultado inutilizável, o sistema deve utilizar o título genérico:

`Ocorrência sem descrição`

A falha na geração do título não deve impedir a criação ou a edição da ocorrência.

O sistema não deve realizar novas tentativas automáticas em decorrência de edições posteriores da descrição.

### RF-05 — Consultar detalhes

O sistema deve permitir que o desenvolvedor consulte os detalhes de uma ocorrência, incluindo:

- Nome da API.
- URL e método HTTP.
- Título atual.
- Descrição original do problema.
- Informações técnicas registradas.

O título atual e a descrição original devem ser apresentados como informações distintas.

### RF-06 — Editar ocorrência

O sistema deve permitir a edição dos seguintes campos:

- Nome ou identificador da API.
- URL pretendida.
- Método HTTP pretendido.
- Descrição do problema.
- Informações técnicas registradas.

A edição deve preservar os campos que não foram alterados.

O título não poderá ser editado manualmente nesta versão.

A edição de uma descrição já existente não deverá modificar automaticamente o título atual nem disparar uma nova geração automática.

### RF-07 — Registrar ocorrência sem resposta HTTP

O sistema deve permitir a criação de uma ocorrência mesmo quando o desenvolvedor ainda não tiver enviado a requisição ou recebido uma resposta HTTP.

O desenvolvedor não precisará classificar a etapa em que o problema ocorreu.

### RF-08 — Tentar gerar o título novamente

Quando uma ocorrência possuir uma descrição e seu título atual for `Ocorrência sem descrição`, o sistema deve permitir que o desenvolvedor solicite manualmente uma nova tentativa de geração.

A nova tentativa deve utilizar a descrição atualmente armazenada.

Se a geração for bem-sucedida, o sistema deve substituir o título genérico pelo título gerado.

Se a geração falhar ou retornar um resultado inutilizável, o sistema deve manter o título atual e preservar a descrição original.

A tentativa manual não deve exigir que o desenvolvedor apague ou reescreva a descrição.

## 4. Regras de negócio

### RN-01 — Campos obrigatórios

Toda ocorrência deve possuir:

- Nome ou identificador da API.
- URL pretendida.
- Método HTTP pretendido.

A descrição e as informações técnicas são opcionais.

### RN-02 — Validação da URL

A URL deve ser absoluta e utilizar o protocolo HTTP ou HTTPS.

URLs inválidas devem ser rejeitadas.

### RN-03 — Métodos HTTP aceitos

O sistema deve aceitar somente os seguintes métodos:

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

### RN-04 — Título obrigatório

Toda ocorrência deve possuir um título utilizável.

Na ausência de descrição ou quando a geração automática não produzir um título válido, o sistema deve utilizar `Ocorrência sem descrição`.

### RN-05 — Preservação da descrição

A descrição fornecida pelo desenvolvedor deve ser preservada independentemente do resultado da geração do título.

O título não substitui nem modifica a descrição original.

### RN-06 — Falha na geração automática

A indisponibilidade da IA, erros de comunicação ou resultados inutilizáveis não devem impedir a criação ou a edição da ocorrência.

Após uma falha automática, novas tentativas somente devem ocorrer mediante solicitação explícita do desenvolvedor.

### RN-07 — Nova tentativa manual

A geração manual poderá ser solicitada quando:

- A ocorrência possuir uma descrição.
- O título atual for `Ocorrência sem descrição`.

A solicitação deve utilizar a descrição já armazenada, sem exigir que ela seja alterada.

### RN-08 — Preservação dos dados na edição

A edição de uma ocorrência deve modificar somente os campos informados para alteração, preservando os demais dados.

A identidade da ocorrência e seus metadados imutáveis não devem ser alterados por uma edição comum.

### RN-09 — Proteção de dados sensíveis

Credenciais, tokens, chaves de API, senhas e outros dados sensíveis não devem ser persistidos nem enviados à IA sem as proteções definidas pelo projeto.

O tratamento específico desses dados deverá ser detalhado em uma especificação de segurança.

## 5. Critérios de aceitação

### CA-01 — Criar ocorrência sem descrição

**Dado que** o desenvolvedor informou os campos obrigatórios,

**quando** criar uma ocorrência sem descrição,

**então** o sistema deve salvar a ocorrência com o título `Ocorrência sem descrição`, sem solicitar a geração de título à IA.

### CA-02 — Rejeitar campos obrigatórios ausentes

**Dado que** um ou mais campos obrigatórios estão ausentes ou inválidos,

**quando** o desenvolvedor tentar criar uma ocorrência,

**então** o sistema deve rejeitar a operação e informar a validação que falhou.

### CA-03 — Validar URL

**Dado que** o desenvolvedor informou uma URL,

**quando** a URL não for absoluta ou não utilizar HTTP ou HTTPS,

**então** o sistema deve rejeitar a operação.

### CA-04 — Validar método HTTP

**Dado que** o desenvolvedor informou um método HTTP não permitido,

**quando** tentar criar ou editar a ocorrência,

**então** o sistema deve rejeitar a operação.

### CA-05 — Gerar título a partir da descrição

**Dado que** o desenvolvedor criou uma ocorrência com descrição,

**quando** a geração automática retornar um título utilizável,

**então** o sistema deve salvar o título gerado e preservar a descrição original.

### CA-06 — Falha na geração automática

**Dado que** o desenvolvedor criou uma ocorrência com descrição,

**quando** a geração do título falhar ou retornar um resultado inutilizável,

**então** o sistema deve salvar a ocorrência com o título `Ocorrência sem descrição` e preservar a descrição fornecida.

### CA-07 — Criar sem resposta HTTP

**Dado que** o desenvolvedor ainda não possui uma resposta HTTP ou informações técnicas,

**quando** criar uma ocorrência com os campos obrigatórios válidos,

**então** o sistema deve permitir a criação.

### CA-08 — Preservar campos não alterados

**Dado que** uma ocorrência possui vários campos preenchidos,

**quando** o desenvolvedor editar apenas parte deles,

**então** o sistema deve preservar os valores dos campos não alterados.

### CA-09 — Rejeitar edição inválida

**Dado que** o desenvolvedor tenta alterar um campo para um valor inválido,

**quando** salvar a edição,

**então** o sistema deve rejeitar a operação sem persistir os valores inválidos.

### CA-10 — Adicionar descrição posteriormente

**Dado que** uma ocorrência foi criada sem descrição e possui o título `Ocorrência sem descrição`,

**quando** o desenvolvedor adicionar uma descrição pela primeira vez,

**então** o sistema deve tentar gerar um título automaticamente.

Se a geração for bem-sucedida, o título genérico deve ser substituído. Se falhar, a descrição deve ser salva e o título genérico deve ser mantido.

### CA-11 — Editar descrição existente

**Dado que** uma ocorrência já possui uma descrição,

**quando** o desenvolvedor editar essa descrição,

**então** o sistema deve salvar a nova descrição sem gerar automaticamente outro título e sem alterar o título atual.

### CA-12 — Solicitar nova tentativa de geração

**Dado que** uma ocorrência possui uma descrição e o título atual é `Ocorrência sem descrição`,

**quando** o desenvolvedor solicitar uma nova tentativa de geração,

**então** o sistema deve tentar gerar um título utilizando a descrição armazenada.

Se a geração for bem-sucedida, o sistema deve substituir o título genérico. Se falhar ou retornar um resultado inutilizável, deve manter o título atual e preservar a descrição.

### CA-13 — Preservar a ocorrência após falha da IA

**Dado que** uma ocorrência foi criada ou editada com dados válidos,

**quando** a IA estiver indisponível,

**então** os dados da ocorrência devem ser persistidos normalmente, respeitando as regras de validação e segurança.

## 6. Fora do escopo

- Listagem, pesquisa e filtragem de ocorrências.
- Gestão completa de evidências.
- Diagnóstico completo do problema por IA.
- Edição manual do título.
- Classificação automática da etapa em que ocorreu o problema.
- Execução de requisições HTTP para a API investigada.
- Investigação autônoma pela IA.
- Correção automática dos problemas.
- Definição da arquitetura interna, banco de dados e endpoints.

## 7. Pontos a definir antes da implementação

- Limites de tamanho dos campos e validações detalhadas.
- Regras para normalização e armazenamento da URL.
- Formato e validação dos dados técnicos registrados.
- Tratamento específico de credenciais e dados sensíveis.
- Formato de resposta e critérios para considerar um título gerado utilizável.
- Estratégia de persistência e tratamento de falhas entre a geração do título e o salvamento da ocorrência.