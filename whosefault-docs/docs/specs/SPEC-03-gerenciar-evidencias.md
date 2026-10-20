# SPEC-03 — Gerenciar evidências

## 1. Objetivo

Permitir que o desenvolvedor registre, consulte, edite e remova evidências associadas a uma ocorrência do WhoseFault.

As evidências devem reunir informações relevantes para investigar problemas de integração com APIs, sem exigir que todos os dados estejam disponíveis no momento do registro.

O sistema deve proteger dados sensíveis presentes nas evidências, evitando sua persistência desprotegida ou seu envio à inteligência artificial em texto puro.

## 2. Escopo

Esta especificação contempla:

- Registrar várias evidências independentes em uma ocorrência.
- Suportar quatro tipos de evidência: requisição HTTP, resposta HTTP, log ou mensagem de erro e observação manual.
- Utilizar formulários específicos para cada tipo, combinando campos estruturados e texto livre.
- Consultar, editar e remover evidências individualmente.
- Validar os dados de cada evidência.
- Detectar possíveis dados sensíveis e orientar o desenvolvedor sobre como tratá-los.
- Impedir a persistência desprotegida ou o envio à IA de segredos identificados.
- Excluir evidências definitivamente após confirmação do desenvolvedor.

O gerenciamento de evidências não deve depender da disponibilidade da IA.

## 3. Requisitos funcionais

### RF-01 — Registrar evidência

O sistema deve permitir que o desenvolvedor registre uma evidência associada a uma ocorrência existente.

Cada evidência deve possuir um tipo e os dados correspondentes.

Uma ocorrência poderá possuir várias evidências independentes, inclusive várias evidências do mesmo tipo.

A ausência de evidências não deverá impedir o registro ou a consulta da ocorrência.

### RF-02 — Registrar requisição HTTP

O sistema deve disponibilizar um formulário para registrar informações de uma requisição HTTP.

Os campos obrigatórios serão:

- Método HTTP.
- URL.

O formulário também deverá permitir o registro opcional de:

- Cabeçalhos.
- Payload ou corpo enviado.
- Outras informações em texto livre.

O registro não deverá exigir que a requisição tenha sido efetivamente enviada. O WhoseFault não executará a requisição.

### RF-03 — Registrar resposta HTTP

O sistema deve disponibilizar um formulário para registrar informações de uma resposta HTTP.

O campo obrigatório será:

- Status HTTP.

O formulário também deverá permitir o registro opcional de:

- Cabeçalhos.
- Corpo da resposta.
- Outras informações em texto livre.

Uma resposta poderá ser registrada sem que exista uma evidência de requisição correspondente.

### RF-04 — Registrar log ou mensagem de erro

O sistema deve disponibilizar um formulário para registrar um log ou uma mensagem de erro.

O campo obrigatório será:

- Conteúdo textual do log ou da mensagem de erro.

O formulário poderá incluir um campo opcional para contexto adicional.

O conteúdo poderá ser copiado de terminais, aplicações, serviços ou outras ferramentas.

### RF-05 — Registrar observação manual

O sistema deve disponibilizar um formulário para registrar uma observação relacionada à investigação.

O campo obrigatório será:

- Conteúdo textual da observação.

O desenvolvedor poderá registrar contexto adicional, comportamentos observados ou informações que não se enquadrem nos outros tipos de evidência.

### RF-06 — Consultar evidências

O sistema deve permitir que o desenvolvedor consulte as evidências associadas a uma ocorrência.

Cada evidência deverá apresentar seu tipo e conteúdo registrado, de maneira que possa ser identificada individualmente.

### RF-07 — Editar evidência

O sistema deve permitir que o desenvolvedor edite uma evidência existente.

A edição deverá respeitar as validações aplicáveis ao tipo de evidência e preservar os dados que não foram alterados.

A edição de uma evidência não deverá modificar diretamente as demais evidências ou os dados principais da ocorrência.

### RF-08 — Remover evidência

O sistema deve permitir que o desenvolvedor solicite a remoção de uma evidência.

Antes da exclusão, o sistema deverá apresentar uma confirmação informando que a ação é definitiva e não poderá ser desfeita.

Se o desenvolvedor confirmar, a evidência deverá ser excluída definitivamente.

Se cancelar, nenhuma alteração deverá ser realizada.

A remoção de uma evidência não deverá excluir a ocorrência nem as demais evidências associadas a ela.

### RF-09 — Detectar possíveis dados sensíveis

O sistema deverá verificar o conteúdo das evidências em busca de possíveis dados sensíveis, incluindo:

- Chaves de API.
- Tokens de autenticação ou acesso.
- Senhas.
- Cabeçalhos de autorização.
- Cookies de sessão.
- Chaves privadas.
- Credenciais presentes em URLs, parâmetros, payloads, respostas ou logs.
- Strings de conexão contendo credenciais.

Quando houver indícios de dados sensíveis, o sistema deverá alertar o desenvolvedor e solicitar que o conteúdo seja removido ou mascarado antes de continuar.

O conteúdo identificado como potencialmente sensível não deverá ser persistido em sua forma desprotegida.

### RF-10 — Orientar sobre segredos expostos

Quando o sistema identificar um possível segredo, deverá orientar o desenvolvedor a:

1. Remover ou mascarar o segredo no conteúdo que deseja registrar.
2. Revogar ou rotacionar a credencial no serviço que a emitiu caso ela já tenha sido exposta.
3. Gerar uma nova credencial quando necessário.

A exclusão ou a edição da evidência no WhoseFault não deverá ser apresentada como suficiente para invalidar uma credencial que já tenha sido exposta.

### RF-11 — Proteger dados enviados à IA

Antes de encaminhar evidências à IA, o sistema deverá aplicar as verificações e proteções de segurança definidas pelo projeto.

Segredos identificados não deverão ser enviados à IA em sua forma original.

Quando não for possível garantir o tratamento necessário, o envio deverá ser bloqueado.

### RF-12 — Registrar somente conteúdo textual

Na V1, as evidências deverão ser registradas por meio de formulários textuais, permitindo digitação, inserção ou colagem de conteúdo.

O sistema não deverá permitir upload de arquivos nesta versão.

## 4. Regras de negócio

### RN-01 — Associação obrigatória

Toda evidência deverá pertencer a uma ocorrência existente.

Uma evidência não poderá existir de forma independente de uma ocorrência.

### RN-02 — Independência das evidências

Cada evidência deverá ser registrada, consultada, editada e removida individualmente.

Uma ocorrência poderá conter várias evidências do mesmo tipo ou de tipos diferentes.

### RN-03 — Tipos permitidos

A V1 deverá aceitar somente:

- Requisição HTTP.
- Resposta HTTP.
- Log ou mensagem de erro.
- Observação manual.

### RN-04 — Campos obrigatórios

Os campos obrigatórios por tipo serão:

| Tipo | Campos obrigatórios |
|---|---|
| Requisição HTTP | Método HTTP e URL |
| Resposta HTTP | Status HTTP |
| Log ou mensagem de erro | Conteúdo textual |
| Observação manual | Conteúdo textual |

Os demais campos serão opcionais.

Os limites de tamanho e as validações detalhadas deverão ser definidos antes da implementação.

### RN-05 — Dados técnicos incompletos

O sistema não deverá exigir informações que o desenvolvedor não possui.

Uma evidência poderá conter apenas os dados obrigatórios e as informações adicionais disponíveis.

### RN-06 — Métodos HTTP aceitos

O formulário de requisição HTTP deverá aceitar somente os métodos definidos na SPEC-01:

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

### RN-07 — Validação da URL

A URL da requisição deverá ser absoluta e utilizar HTTP ou HTTPS, seguindo as regras de validação da SPEC-01.

### RN-08 — Validação do status HTTP

O status HTTP informado deverá ser um código numérico válido no intervalo definido pela especificação técnica de validação antes da implementação.

### RN-09 — Preservação na edição

A edição de uma evidência deverá modificar somente os dados submetidos para alteração, preservando os demais campos e metadados.

### RN-10 — Exclusão definitiva

Uma evidência excluída não poderá ser recuperada pela interface do sistema.

A exclusão deverá ocorrer somente após confirmação explícita do desenvolvedor.

### RN-11 — Proteção antes da persistência

O conteúdo identificado como potencialmente sensível não deverá ser persistido em sua forma desprotegida.

O sistema deverá solicitar que o desenvolvedor remova ou mascare o conteúdo antes de permitir o registro.

### RN-12 — Limitações da detecção

A detecção automática não garante a identificação de todos os formatos de dados sensíveis.

O sistema deverá informar que o desenvolvedor também é responsável por revisar o conteúdo antes de registrá-lo.

A ausência de alertas não deverá ser apresentada como garantia de que o conteúdo está livre de segredos.

### RN-13 — Proteção de logs internos

O sistema não deverá incluir conteúdo sensível integral em logs internos de erro, diagnóstico ou depuração.

### RN-14 — Independência da IA

O registro, a consulta, a edição e a exclusão de evidências não deverão depender da disponibilidade da IA.

### RN-15 — Ausência de upload

A V1 deverá aceitar somente conteúdo textual. O envio de arquivos ficará fora do escopo.

## 5. Critérios de aceitação

### CA-01 — Registrar requisição HTTP

**Dado que** existe uma ocorrência,

**quando** o desenvolvedor informar um método HTTP e uma URL válidos,

**então** o sistema deverá permitir o registro da evidência, mesmo que os campos opcionais estejam vazios.

### CA-02 — Rejeitar requisição inválida

**Dado que** o método HTTP ou a URL são inválidos,

**quando** o desenvolvedor tentar registrar a requisição,

**então** o sistema deverá rejeitar a operação e informar o problema encontrado.

### CA-03 — Registrar resposta HTTP

**Dado que** existe uma ocorrência,

**quando** o desenvolvedor informar um status HTTP válido,

**então** o sistema deverá permitir o registro da resposta sem exigir uma evidência de requisição correspondente.

### CA-04 — Rejeitar resposta inválida

**Dado que** o status HTTP informado é inválido,

**quando** o desenvolvedor tentar registrar a resposta,

**então** o sistema deverá rejeitar a operação.

### CA-05 — Registrar log ou mensagem de erro

**Dado que** existe uma ocorrência,

**quando** o desenvolvedor informar o conteúdo textual obrigatório,

**então** o sistema deverá permitir o registro da evidência.

### CA-06 — Registrar observação manual

**Dado que** existe uma ocorrência,

**quando** o desenvolvedor informar o conteúdo textual obrigatório,

**então** o sistema deverá permitir o registro da observação.

### CA-07 — Registrar várias evidências

**Dado que** existe uma ocorrência,

**quando** o desenvolvedor registrar várias evidências, inclusive do mesmo tipo,

**então** o sistema deverá manter todas as evidências independentes, sem sobrescrever as anteriores.

### CA-08 — Consultar evidências

**Dado que** uma ocorrência possui evidências registradas,

**quando** o desenvolvedor consultar suas evidências,

**então** o sistema deverá apresentar cada evidência com seu tipo e conteúdo correspondente.

### CA-09 — Editar evidência

**Dado que** existe uma evidência registrada,

**quando** o desenvolvedor editar seu conteúdo com valores válidos,

**então** o sistema deverá salvar as alterações, preservar os dados não modificados e manter as demais evidências intactas.

### CA-10 — Confirmar exclusão

**Dado que** existe uma evidência registrada,

**quando** o desenvolvedor solicitar sua exclusão,

**então** o sistema deverá solicitar confirmação antes de realizar a operação.

### CA-11 — Cancelar exclusão

**Dado que** o sistema está solicitando confirmação de exclusão,

**quando** o desenvolvedor cancelar,

**então** a evidência deverá permanecer registrada sem alterações.

### CA-12 — Excluir definitivamente

**Dado que** o sistema está solicitando confirmação de exclusão,

**quando** o desenvolvedor confirmar,

**então** o sistema deverá excluir definitivamente a evidência selecionada, sem excluir a ocorrência ou as demais evidências.

### CA-13 — Detectar possível segredo

**Dado que** o conteúdo submetido contém um padrão identificado como possível segredo,

**quando** o desenvolvedor tentar registrar ou editar a evidência,

**então** o sistema deverá alertá-lo, impedir a persistência do conteúdo não protegido e orientar sua remoção ou mascaramento.

### CA-14 — Orientar sobre credencial exposta

**Dado que** o sistema identificou um possível segredo que pode já ter sido exposto,

**quando** apresentar a orientação de segurança,

**então** deverá recomendar sua revogação ou rotação no serviço de origem, deixando claro que apagar o conteúdo do WhoseFault não invalida a credencial.

### CA-15 — Impedir envio desprotegido à IA

**Dado que** uma evidência contém um segredo identificado,

**quando** o sistema preparar informações para a IA,

**então** deverá remover ou mascarar o segredo antes do envio, ou bloquear o envio se não for possível garantir a proteção.

### CA-16 — Gerenciar evidências sem disponibilidade da IA

**Dado que** a IA está indisponível,

**quando** o desenvolvedor registrar, consultar, editar ou remover uma evidência válida,

**então** o sistema deverá permitir a operação normalmente, respeitando as regras de validação e segurança.

### CA-17 — Não permitir upload de arquivos

**Dado que** o desenvolvedor está registrando uma evidência,

**quando** utilizar os recursos disponíveis na V1,

**então** o sistema deverá oferecer somente formas de registro textual, sem permitir upload de arquivos.

## 6. Fora do escopo

- Upload ou armazenamento de arquivos.
- Execução de requisições HTTP.
- Captura automática de tráfego de rede.
- Integração automática com ferramentas de logs.
- Correlação automática entre requisições e respostas.
- Versionamento ou recuperação de evidências excluídas.
- Colaboração entre usuários.
- Diagnóstico autônomo por IA.
- Correção automática de problemas.
- Garantia de detecção de todos os possíveis segredos.
- Histórico completo de alterações de evidências.

## 7. Pontos a definir antes da implementação

- Limites de tamanho por campo e por evidência.
- Formato de armazenamento de cabeçalhos e payloads.
- Regras detalhadas de validação dos campos.
- Estratégia de detecção e mascaramento de dados sensíveis.
- Comportamento da interface ao identificar um possível segredo.
- Tratamento de URLs e parâmetros que contenham credenciais.
- Regras de autenticação e autorização.
- Política de retenção e exclusão de dados.
- Formato de envio das evidências à IA e limites de conteúdo processado.
- Tratamento de dados sensíveis em backups e outros mecanismos de retenção, caso existam.
