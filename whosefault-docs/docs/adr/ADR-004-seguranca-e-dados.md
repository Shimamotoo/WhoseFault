# ADR-004 — Segurança e tratamento de dados

- **Status:** Aprovado
- **Data:** 2026-10-19

## 1. Contexto

O WhoseFault armazena descrições de ocorrências, requisições, respostas, logs, observações e diagnósticos. Esses conteúdos podem incluir credenciais e outras informações confidenciais.

A aplicação também poderá enviar parte desses dados a um provedor externo de IA. Precisamos reduzir o risco de exposição durante a entrada, persistência, processamento, envio e registro de erros.

## 2. Decisão proposta

Adotar uma política conservadora de detecção e bloqueio de possíveis segredos.

Quando o backend identificar um possível segredo em conteúdo destinado à persistência, deverá bloquear a gravação desse conteúdo até que o usuário o corrija. Na V1, não haverá opção para ignorar o alerta e salvar o conteúdo original.

A detecção será baseada em padrões conhecidos e contexto, sem depender de um modelo de IA para decidir se o conteúdo pode ser salvo.

As categorias iniciais de detecção incluem:

- Tokens, JWTs e tokens de sessão.
- Senhas e campos que contenham credenciais.
- Chaves de API.
- Cabeçalhos de autenticação.
- Cookies e identificadores de sessão.
- Chaves privadas e blocos PEM.
- Credenciais embutidas em URLs.
- Strings de conexão com credenciais.
- Credenciais em configurações e variáveis de ambiente.

A detecção não será considerada infalível. O usuário deverá revisar manualmente o conteúdo antes de enviá-lo.

## 3. Proteção antes de chamadas à IA

Antes de cada chamada ao provedor, o backend deverá realizar uma nova verificação de segurança, mesmo que os dados tenham sido validados anteriormente.

O contexto enviado deverá conter somente os dados necessários à tarefa solicitada. Credenciais conhecidas não poderão ser enviadas deliberadamente em texto puro.

A política deverá ser aplicada tanto à geração de títulos quanto à geração de diagnósticos.

O usuário deverá ser informado de que o conteúdo selecionado poderá ser processado por um serviço externo de IA. Essa informação deverá continuar acessível após o primeiro uso.

## 4. Tratamento de falsos positivos

Na V1, não haverá mecanismo para ignorar o bloqueio e persistir o conteúdo suspeito.

As mensagens de erro deverão identificar o campo que requer revisão sem reproduzir desnecessariamente o valor suspeito.

Os padrões de detecção deverão ser testados para reduzir bloqueios indevidos. Se conteúdo legítimo for bloqueado, o usuário deverá reformulá-lo ou remover o trecho que provoca a detecção.

## 5. Limites, logs e credenciais da aplicação

- Campos e contextos enviados à IA terão limites de tamanho definidos antes da implementação.
- Contextos grandes demais não serão reduzidos silenciosamente; o usuário será informado e poderá reduzir ou selecionar o conteúdo.
- Chaves do provedor ficarão no backend e não serão incluídas no frontend ou no repositório.
- Logs de aplicação e mensagens de erro não deverão registrar segredos conhecidos nem reproduzir integralmente conteúdos sensíveis.
- O ambiente local deverá evitar exposição desnecessária de portas e serviços.
- A aplicação não deverá ser disponibilizada remotamente sem uma estratégia adequada de autenticação e controle de acesso.

A política não pressupõe que uma aplicação local esteja livre de riscos apenas por utilizar localhost.

## 6. Exclusão e retenção

A exclusão de uma ocorrência deverá remover também as evidências e o diagnóstico associados, conforme as regras do domínio.

Quando uma evidência for excluída, o diagnóstico relacionado deverá ser marcado como desatualizado, e seu contexto salvo deverá ser higienizado conforme as regras definidas no modelo de domínio. Se não for possível remover com segurança o conteúdo derivado, o conteúdo do diagnóstico deverá ser removido, preservando apenas o registro mínimo permitido para indicar essa remoção.

A política de backups e retenção deverá ser definida de forma compatível com a expectativa de exclusão. A exclusão no banco principal não implica, por si só, eliminação imediata de backups, logs externos ou dados retidos por provedores.

Se uma credencial já tiver sido exposta, removê-la do WhoseFault não a invalida; o usuário deverá revogá-la ou substituí-la no serviço de origem.

## 7. Alternativas consideradas

### A. Apenas alertar o usuário

**Vantagem:** menor atrito para o usuário.

**Desvantagem:** facilita a persistência ou o envio acidental de credenciais.

### B. Detectar e bloquear até a correção — recomendada

**Vantagens:** política simples, previsível e conservadora, com comportamento verificável por testes.

**Desvantagens:** falsos positivos podem impedir o envio de conteúdo legítimo e exigem revisão pelo usuário.

### C. Mascarar automaticamente e salvar

**Vantagem:** reduz o atrito.

**Desvantagem:** pode alterar evidências técnicas silenciosamente e introduzir dúvidas sobre o conteúdo efetivamente armazenado.

A proposta é preferir o bloqueio explícito para preservar a previsibilidade e evitar alterações silenciosas.

## 8. Fora do escopo

Este ADR não define a implementação completa do detector, os limites numéricos dos campos, o provedor de IA, a política operacional detalhada de backups ou o mecanismo de autenticação para uma futura versão online.

## 9. Critérios para validar a decisão

- Conteúdo identificado como suspeito não é persistido antes da correção.
- As verificações são aplicadas no backend.
- O conteúdo é verificado novamente antes de cada chamada à IA.
- Logs e mensagens de erro não expõem segredos conhecidos.
- As limitações da detecção são documentadas e testadas.
- O envio de dados ao provedor é transparente e limitado ao necessário.
