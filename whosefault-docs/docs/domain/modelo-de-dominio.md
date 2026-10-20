# WhoseFault — Modelo de Domínio

**Versão:** 1.0  
**Status:** Consolidado para a etapa de modelagem de domínio  
**Escopo:** V1

## 1. Objetivo

O WhoseFault é uma ferramenta para registrar e investigar problemas em integrações de APIs, reunindo informações sobre ocorrências, evidências técnicas e diagnósticos assistidos por inteligência artificial.

O objetivo do modelo de domínio é definir os conceitos centrais do sistema, suas responsabilidades, seus relacionamentos e as regras que precisam ser respeitadas independentemente da interface ou da tecnologia utilizada.

O domínio deve garantir que:

- Uma ocorrência possa ser registrada mesmo sem evidências completas.
- As evidências sejam gerenciadas independentemente da ocorrência.
- O diagnóstico por IA seja persistido e relacionado à ocorrência.
- Alterações nas informações utilizadas pela IA sejam refletidas no estado do diagnóstico.
- Falhas na geração do diagnóstico não provoquem perda de informações existentes.
- Dados excluídos não permaneçam acessíveis por meio de cópias indevidas.
- A IA apresente hipóteses e incertezas sem inventar informações ou conclusões.

## 2. Conceitos do domínio

A V1 possui três conceitos centrais:

1. **Ocorrência:** representa um problema ou situação que o usuário deseja investigar.
2. **Evidência:** representa uma informação técnica ou observação que ajuda a investigar uma ocorrência.
3. **Diagnóstico por IA:** representa uma análise das informações disponíveis sobre uma ocorrência em determinado momento.

Esses conceitos são relacionados, mas possuem responsabilidades distintas.

Uma ocorrência pode existir sem evidências e sem diagnóstico. As evidências podem ser adicionadas gradualmente. O diagnóstico é gerado sob solicitação do usuário e pode ficar desatualizado quando as informações da investigação mudam.

## 3. Ocorrência

### 3.1. Responsabilidade

Representar o registro principal de uma investigação.

A ocorrência reúne a identificação da API, o endereço pretendido, o método HTTP, a descrição original do problema e as informações técnicas complementares.

Ela também funciona como referência para as evidências e para o diagnóstico associado.

### 3.2. Informações conceituais

- Identificador único.
- Nome ou identificador da API.
- URL pretendida.
- Método HTTP.
- Descrição original do problema, opcional.
- Título atual.
- Informações técnicas complementares, opcionais.
- Data e hora de criação.
- Data e hora da última atualização.

### 3.3. Regras de negócio

**OC-01 — Criação independente de evidências**

Uma ocorrência pode ser criada sem evidências, sem uma resposta HTTP e até mesmo antes de uma requisição ter sido enviada.

**OC-02 — Título obrigatório**

Toda ocorrência deve possuir um título utilizável.

O título é gerado pela IA a partir da descrição quando aplicável. Caso a descrição esteja ausente ou a geração falhe, utiliza-se o título genérico `Ocorrência sem descrição`.

**OC-03 — Preservação da descrição original**

O título gerado pela IA não substitui a descrição original. Ambos são informações distintas.

**OC-04 — Atualização parcial**

A ocorrência pode ser editada parcialmente. Os campos não informados em uma atualização devem permanecer inalterados.

**OC-05 — Regeneração do título**

A edição de uma descrição existente não provoca a regeneração automática do título.

Quando o título for genérico e houver uma descrição, o usuário poderá solicitar sua geração novamente. Se a tentativa falhar, o título atual e a descrição devem ser preservados.

**OC-06 — Título não invalida o diagnóstico**

A alteração exclusiva do título não torna o diagnóstico desatualizado, pois o título é uma representação da ocorrência, não uma evidência utilizada na investigação.

**OC-07 — Exclusão definitiva**

A exclusão de uma ocorrência remove definitivamente a ocorrência, todas as suas evidências e o diagnóstico associado.

Não haverá lixeira, restauração ou recuperação pela aplicação na V1.

**OC-08 — Integridade da exclusão**

A exclusão não pode deixar evidências ou diagnósticos órfãos, nem permitir que uma operação assíncrona recrie dados excluídos.

As garantias de exclusão em backups, logs e outros mecanismos de retenção devem ser definidas nas decisões técnicas de persistência e segurança.

### 3.4. Validações já definidas

- A URL deve ser absoluta e utilizar HTTP ou HTTPS.
- Os métodos permitidos são `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` e `OPTIONS`.
- Informações de autenticação não devem expor credenciais desprotegidas.

Limites de caracteres, normalização de URLs e regras detalhadas de validação ainda precisam ser definidos.

## 4. Evidência

### 4.1. Responsabilidade

Representar uma informação específica que contribui para a investigação de uma ocorrência.

Uma ocorrência pode possuir várias evidências do mesmo tipo. Cada evidência possui seu próprio ciclo de vida e pode ser criada, editada ou excluída independentemente das demais.

### 4.2. Informações conceituais

- Identificador único.
- Identificador da ocorrência relacionada.
- Tipo de evidência.
- Conteúdo específico do tipo.
- Informações complementares, quando aplicáveis.
- Data e hora de criação.
- Data e hora da última atualização.

### 4.3. Tipos de evidência

**1. Requisição HTTP**

- Método HTTP: obrigatório.
- URL: obrigatória.
- Cabeçalhos: opcionais.
- Payload ou corpo da requisição: opcional.
- Texto complementar: opcional.

**2. Resposta HTTP**

- Status HTTP: obrigatório.
- Cabeçalhos: opcionais.
- Corpo da resposta: opcional.
- Texto complementar: opcional.

Uma resposta pode ser registrada sem uma evidência de requisição correspondente.

**3. Log ou mensagem de erro**

- Conteúdo textual: obrigatório.
- Contexto complementar: opcional.

**4. Observação manual**

- Conteúdo textual: obrigatório.

Na V1, as evidências serão inseridas manualmente por meio de texto. Não haverá upload de arquivos nem captura automática de tráfego.

### 4.4. Regras de negócio

**EV-01 — Vínculo obrigatório**

Toda evidência deve pertencer a uma ocorrência existente.

**EV-02 — Independência**

Uma ocorrência pode possuir várias evidências do mesmo tipo, sem exigir uma correspondência individual entre requisições e respostas.

**EV-03 — Gerenciamento independente**

O usuário pode criar, editar e excluir cada evidência individualmente.

**EV-04 — Atualização parcial**

A edição de uma evidência deve preservar os campos não alterados.

**EV-05 — Confirmação de exclusão**

A exclusão de uma evidência exige confirmação explícita e é definitiva na aplicação.

Excluir uma evidência não exclui a ocorrência nem as outras evidências.

**EV-06 — Segurança do conteúdo**

Antes de persistir uma evidência, o sistema deve verificar a presença de possíveis segredos, como chaves de API, tokens, senhas, cookies, cabeçalhos de autorização, chaves privadas e credenciais em URLs, parâmetros, payloads, respostas ou logs.

Quando houver suspeita de segredo, o usuário deverá mascarar ou remover o conteúdo antes da persistência.

O sistema não deve persistir segredos desprotegidos nem enviá-los à IA em texto puro. A detecção automática não garante a identificação de todos os segredos; o usuário também deverá revisar o conteúdo.

Se uma credencial já tiver sido exposta, o usuário deverá ser orientado a revogá-la ou rotacioná-la na origem. Excluir o conteúdo do WhoseFault não invalida a credencial.

**EV-07 — Exclusão e diagnóstico**

Quando uma evidência for excluída, seu conteúdo não poderá continuar acessível por meio de cópias no contexto ou no resultado do diagnóstico associado.

O diagnóstico poderá permanecer visível e desatualizado, desde que o conteúdo removido e suas reproduções diretas sejam eliminados com segurança. Caso isso não seja possível, o conteúdo do diagnóstico deverá ser removido, preservando-se apenas um registro mínimo da remoção, sem reproduzir a informação excluída.

**EV-08 — Independência da IA**

A indisponibilidade da IA não pode impedir o gerenciamento de evidências.

### 4.5. Validações já definidas

- Os métodos HTTP permitidos são os mesmos definidos para a ocorrência.
- URLs de requisição devem ser absolutas e utilizar HTTP ou HTTPS.
- O status HTTP deve ser validado de acordo com as regras que serão definidas para esse campo.
- Os campos obrigatórios variam conforme o tipo de evidência.

Os limites de tamanho, a representação dos cabeçalhos e dos payloads e as regras detalhadas de detecção de segredos permanecem pendentes.

## 5. Diagnóstico por IA

### 5.1. Responsabilidade

Representar o resultado de uma análise das informações disponíveis em uma ocorrência em determinado momento.

O diagnóstico é um conceito próprio do domínio, e não apenas um campo textual da ocorrência. Ele possui seu próprio conteúdo, contexto de análise e estado de atualização.

### 5.2. Informações conceituais

- Identificador único.
- Identificador da ocorrência relacionada.
- Resultado do diagnóstico.
- Contexto ou retrato dos dados considerados na análise.
- Data e hora da geração.
- Identificador do modelo de IA utilizado, quando disponível.
- Estado de atualização do diagnóstico.
- Registro mínimo de remoção de conteúdo, quando necessário por segurança.

O resultado deve distinguir, quando aplicável:

- Fatos observados nas informações disponíveis.
- Hipóteses levantadas.
- Justificativas para as hipóteses.
- Grau de incerteza ou limitações da análise.
- Conclusões sustentadas pelas evidências.
- Informações adicionais necessárias para refinar a investigação.

### 5.3. Regras de negócio

**DI-01 — Geração sob solicitação**

O diagnóstico é gerado quando o usuário solicita a análise. Alterações na ocorrência ou nas evidências não iniciam automaticamente uma nova análise.

**DI-02 — Persistência**

O diagnóstico é salvo e vinculado à ocorrência.

Na V1, haverá no máximo um diagnóstico atual por ocorrência. Uma nova análise concluída com sucesso substituirá o diagnóstico anterior, sem manter um histórico de versões de diagnósticos.

**DI-03 — Contexto da análise**

O sistema deve preservar um retrato das informações consideradas pela IA, além do resultado produzido.

Esse contexto permite identificar quais informações fundamentaram o diagnóstico e distinguir dados atuais de conclusões anteriores.

O contexto está sujeito às mesmas regras de segurança, minimização e exclusão aplicáveis às evidências.

**DI-04 — Estado de atualização**

O diagnóstico possui um estado que indica se ainda corresponde às informações atuais da investigação.

Um diagnóstico pode estar atualizado ou desatualizado.

**DI-05 — Invalidação**

O diagnóstico torna-se desatualizado quando qualquer informação utilizada como evidência para a investigação é adicionada, alterada ou excluída.

Isso inclui:

- Nome ou identificador da API.
- URL pretendida.
- Método HTTP.
- Descrição original do problema.
- Informações técnicas complementares.
- Criação de uma evidência.
- Edição de uma evidência.
- Exclusão de uma evidência.

A alteração exclusiva do título não invalida o diagnóstico.

**DI-06 — Visibilidade do diagnóstico desatualizado**

O diagnóstico anterior continua visível mesmo quando desatualizado, acompanhado de um aviso claro.

O objetivo é permitir que o usuário consulte conclusões anteriores e acompanhe o que já foi investigado.

**DI-07 — Contexto histórico para a IA**

Uma nova análise poderá considerar o diagnóstico anterior como contexto de investigação, para aproveitar hipóteses e tentativas anteriores.

O diagnóstico anterior deverá ser identificado como uma análise passada, e não como evidência atual. A IA deve priorizar as evidências atuais e reconhecer quando conclusões anteriores deixaram de ser sustentadas.

**DI-08 — Falha de geração**

Se uma nova análise falhar, retornar conteúdo inválido ou não produzir um resultado utilizável, o diagnóstico anterior não será substituído.

Se houver um diagnóstico anterior, ele continuará disponível e desatualizado. Se não houver, a ocorrência permanecerá sem diagnóstico válido.

A interface deverá exibir uma mensagem de erro e disponibilizar uma ação para tentar novamente.

**DI-09 — Diagnóstico inconclusivo**

A insuficiência de evidências não representa, por si só, uma falha na geração.

A IA pode produzir um diagnóstico válido que explique as limitações da análise, apresente hipóteses fundamentadas e indique quais informações adicionais ajudariam a refinar a resposta.

A IA não deve inventar fatos, apresentar hipóteses como certezas ou declarar uma causa raiz sem sustentação suficiente.

**DI-10 — Segurança do resultado e do contexto**

O resultado e o contexto do diagnóstico devem ser tratados como conteúdo potencialmente sensível.

O sistema deve evitar persistir ou enviar segredos desprotegidos à IA, aplicar as verificações de segurança necessárias e impedir que conteúdo excluído de uma evidência permaneça acessível por cópias no diagnóstico.

**DI-11 — Exclusão da ocorrência**

A exclusão da ocorrência implica a exclusão definitiva do diagnóstico associado.

Uma resposta tardia da IA não pode recriar a ocorrência ou o diagnóstico excluídos.

**DI-12 — Consistência durante a geração**

O diagnóstico só pode ser marcado como atualizado se o sistema confirmar que as informações utilizadas na análise continuam consistentes com as informações atuais.

A interface bloqueada não é uma garantia suficiente: o backend também deve proteger a operação contra alterações concorrentes, outras requisições ou exclusões ocorridas durante a geração.

Se os dados forem alterados ou a ocorrência for excluída durante o processamento, o resultado não poderá ser apresentado como atualizado nem salvo de forma que viole as regras do domínio.

O mecanismo para tratar resultados gerados a partir de dados que mudaram durante a análise deverá ser definido na etapa de arquitetura.

### 5.4. Fluxo conceitual de geração

1. O usuário solicita a geração de um diagnóstico.
2. A interface da ocorrência é completamente bloqueada para novas interações e apresenta um indicador de carregamento.
3. O sistema prepara e envia à IA as informações autorizadas para análise.
4. O sistema valida o resultado recebido e verifica a consistência dos dados utilizados.
5. Se a análise for válida e os dados continuarem consistentes, o novo diagnóstico é persistido e substitui o anterior.
6. Se a geração falhar, o sistema preserva o diagnóstico anterior, quando existir, exibe um erro e permite uma nova tentativa.
7. Ao término da operação, a interface é desbloqueada.

Se a ocorrência for excluída durante a geração, o resultado tardio deve ser descartado. O cancelamento da chamada externa à IA pode ser tentado quando suportado, mas a garantia essencial é que o resultado não seja salvo nem recrie dados excluídos.

O bloqueio da interface não impede situações externas, como fechamento da aba ou perda de conexão. O sistema deve manter a integridade dos dados mesmo nesses cenários.

## 6. Relacionamentos entre os conceitos

### 6.1. Ocorrência e evidências

- Uma ocorrência pode possuir zero ou várias evidências.
- Cada evidência pertence a exatamente uma ocorrência.
- A exclusão de uma evidência não exclui as demais.
- A exclusão de uma ocorrência exclui todas as suas evidências.

### 6.2. Ocorrência e diagnóstico

- Uma ocorrência pode não possuir diagnóstico.
- Uma ocorrência pode possuir, no máximo, um diagnóstico atual na V1.
- Cada diagnóstico pertence a exatamente uma ocorrência.
- Uma nova análise bem-sucedida substitui o diagnóstico anterior.
- Uma análise malsucedida preserva o diagnóstico anterior.
- A exclusão da ocorrência exclui seu diagnóstico.

### 6.3. Evidências e diagnóstico

O diagnóstico considera as informações relevantes da ocorrência e as evidências disponíveis no momento da análise.

Quando essas informações mudam, o diagnóstico fica desatualizado. O resultado anterior pode permanecer visível e servir de contexto para a investigação, desde que não reproduza conteúdo que tenha sido excluído por segurança.

## 7. Estados conceituais

### 7.1. Estado do diagnóstico

| Estado | Significado |
|---|---|
| Ausente | Nenhum diagnóstico válido foi gerado ou está disponível. |
| Atualizado | O diagnóstico corresponde às informações utilizadas na investigação atual. |
| Desatualizado | As informações relevantes mudaram desde a geração do diagnóstico. |

A geração em andamento é um estado operacional da aplicação e da interface, não um estado persistido do diagnóstico.

### 7.2. Estado da geração

| Situação | Comportamento |
|---|---|
| Em andamento | A interface da ocorrência fica bloqueada. |
| Sucesso válido | Salva e substitui o diagnóstico anterior. |
| Falha ou resposta inválida | Preserva o diagnóstico anterior e permite tentar novamente. |
| Dados alterados durante a geração | Não apresenta o resultado como atualizado. |
| Ocorrência excluída durante a geração | Descarta o resultado e não recria dados. |

## 8. Limites da V1

Estão fora do escopo:

- Criação de contas e autenticação de usuários.
- Colaboração entre usuários.
- Upload de arquivos e captura automática de tráfego.
- Integração automática com sistemas de logs.
- Correlação automática de requisições e respostas.
- Histórico de versões de diagnósticos.
- Lixeira ou restauração de registros.
- Execução automática de requisições pela IA.
- Remediação autônoma de problemas.
- Garantia de detecção de todos os segredos.
- Regeneração automática de diagnósticos após alterações.

A ausência de contas não significa que os dados devam ficar publicamente acessíveis. A política de acesso e proteção dos dados deverá ser definida antes da implementação.

## 9. Decisões de domínio consolidadas

As seguintes decisões foram aprovadas durante a modelagem:

1. Não haverá criação de contas na V1.
2. O diagnóstico será persistido e vinculado à ocorrência.
3. O diagnóstico ficará desatualizado quando as informações relevantes mudarem.
4. Uma falha de geração preservará o diagnóstico anterior.
5. O resultado e o contexto da análise serão armazenados.
6. Uma nova análise bem-sucedida substituirá o diagnóstico anterior, sem histórico de versões.
7. Durante a geração, a interface da ocorrência ficará completamente bloqueada.
8. A falha será comunicada na interface, com uma opção para tentar novamente.
9. Todas as alterações nas informações utilizadas como evidência invalidam o diagnóstico, exceto a alteração exclusiva do título.
10. O diagnóstico desatualizado continuará visível, com identificação clara.
11. A IA poderá produzir diagnósticos inconclusivos, desde que explicite suas limitações e indique informações adicionais necessárias.
12. A exclusão de uma evidência não poderá ser contornada por cópias no contexto ou no resultado do diagnóstico.
13. A exclusão de uma ocorrência, de suas evidências e de seu diagnóstico será definitiva na aplicação.
14. Resultados assíncronos não poderão recriar dados excluídos ou ser apresentados como atualizados quando as informações de origem tiverem mudado.

## 10. Questões para as próximas etapas

O modelo conceitual está consolidado, mas algumas decisões de implementação ainda precisam ser tomadas.

### Validação e representação dos dados

- Limites de caracteres dos campos.
- Formato de armazenamento de cabeçalhos, payloads e informações técnicas.
- Regras completas de validação do status HTTP.
- Normalização de URLs.
- Estrutura exata do resultado do diagnóstico.

### Segurança e persistência

- Política de acesso aos dados sem contas de usuário.
- Estratégia de detecção, mascaramento e remoção de segredos.
- Tratamento de segredos em URLs, resultados de IA, logs, backups e retenção.
- Garantias de exclusão em backups e outros mecanismos de persistência.
- Política de retenção dos dados.

### Consistência e processamento assíncrono

- Como detectar alterações concorrentes durante a geração.
- Como descartar resultados que ficaram inválidos.
- Como tratar perda de conexão e operações cujo resultado não chegou à interface.
- Como evitar que duas gerações simultâneas substituam diagnósticos de forma inconsistente.

### Integração com IA

- Modelo de IA utilizado.
- Limites de contexto e tamanho dos dados enviados.
- Formato estruturado da resposta.
- Validação de respostas inválidas ou incompletas.
- Como fornecer diagnósticos anteriores sem confundi-los com evidências atuais.

Essas questões deverão ser resolvidas nas especificações, nos registros de decisões arquiteturais (ADRs) e no desenho da implementação, sem alterar silenciosamente as regras de domínio já aprovadas.

---

**Fim do documento.**