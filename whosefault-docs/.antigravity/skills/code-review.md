Skill: Code Review & Security Guardrail

Ativação

Ative esta skill quando o usuário pedir para revisar um arquivo, analisar um Diff, fazer code review ou rodar o comando /code-review.

Objetivo

Analisar o código escrito para garantir alta qualidade técnica, aderência aos padrões do projeto WhoseFault, conformidade com a especificação em desenvolvimento e total segurança contra vazamento de credenciais e dados sensíveis.

Passos de Execução

1. Verificação de Segurança (Bloqueante)

Verifique se existem chaves de API, tokens, senhas, credenciais em URLs ou headers inseridos em texto puro.

Verifique se há logs (console.log, logger.info) imprimindo payloads brutos sem mascaramento prévio de dados sensíveis.

Se algum segredo for encontrado, interrompa o review imediatamente e informe o risco de segurança.

2. Aderência às Especificações e AGENTS.md

O código atende estritamente aos Requisitos Funcionais (RF) e Regras de Negócio (RN) da SPEC aplicável?

Foram introduzidas alterações não autorizadas na arquitetura, banco de dados ou contratos de API?

O tratamento de erros cobre falhas de serviços externos (ex: indisponibilidade de IA) sem quebrar o fluxo do usuário?

3. Qualidade de Código e TypeScript

Tipagem Estrita: Uso zerado do tipo any. Interfaces e tipos explícitos para entradas, saídas e DTOs.

Tratamento de Exceções: Uso de blocos try/catch adequados, respostas HTTP corretas (4xx, 5xx) e mensagens legíveis.

Limpeza: Ausência de código morto, imports não utilizados ou comentários obsoletos.

Formato do Retorno do Review

Apresente a análise estruturada no seguinte formato:

Status Geral: [Aprovado / Requer Ajustes / Bloqueado por Segurança]

Achados Críticos (Se houver): Problemas de segurança, quebra de contratos ou descumprimento de regras da SPEC.

Oportunidades de Refatoração: Sugestões de clareza, performance, tipagem ou simplificação.

Check de Cobertura: Indique se os Critérios de Aceitação (CAs) afetados por essa alteração possuem testes correspondentes.