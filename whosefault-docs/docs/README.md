# WhoseFault — Documentação

## Sobre o projeto

O **WhoseFault** é uma ferramenta para registrar e investigar problemas relacionados a integrações com APIs, reunindo ocorrências, evidências técnicas e diagnósticos assistidos por inteligência artificial.

O objetivo é ajudar a organizar as informações disponíveis sobre um problema, levantar hipóteses fundamentadas em evidências e identificar quais informações adicionais podem ser necessárias para uma investigação mais precisa.

A IA atua como assistente de análise. Ela não executa requisições HTTP, não realiza correções autônomas e não substitui a avaliação do usuário.

## Escopo da V1

A primeira versão contempla:

- **Registro de ocorrências:** armazenar informações sobre a API envolvida e a situação observada.
- **Consulta de ocorrências:** listar os registros existentes e acessar seus detalhes.
- **Gerenciamento de evidências:** registrar, consultar, editar e excluir evidências técnicas relacionadas às ocorrências.
- **Diagnóstico assistido por IA:** analisar as informações relevantes, apresentar hipóteses justificadas e explicitar incertezas e limitações.

A V1 será executada localmente com Docker. A implantação online e a evolução da infraestrutura serão consideradas posteriormente.

Entre as limitações iniciais estão a ausência de contas de usuário, colaboração entre usuários, upload de arquivos, execução automática de requisições e remediação autônoma por IA.

Consulte as especificações funcionais para conhecer as regras e os critérios de aceitação completos.

## Organização do projeto

O projeto utiliza três repositórios separados:

| Repositório | Responsabilidade |
|---|---|
| `whosefault-docs` | Documentação, requisitos, modelo de domínio e decisões arquiteturais. |
| `whosefault-api` | Backend desenvolvido com Node.js e TypeScript. |
| `whosefault-web` | Frontend desenvolvido com React e TypeScript. |

A documentação deste repositório serve como referência para o desenvolvimento dos demais componentes.

As decisões arquiteturais aprovadas devem ser respeitadas durante a implementação. Mudanças que afetem requisitos ou decisões existentes devem ser discutidas e aprovadas antes de serem incorporadas.

## Documentação

### Visão geral

- [`overview.md`](overview.md) — visão geral e contexto do projeto.

### Especificações funcionais

- [`SPEC-01 — Registrar ocorrência`](docs/specs/SPEC-01-registrar-ocorrencia.md)
- [`SPEC-02 — Consultar ocorrências`](docs/specs/SPEC-02-consultar-ocorrencias.md)
- [`SPEC-03 — Gerenciar evidências`](docs/specs/SPEC-03-gerenciar-evidencias.md)

### Modelo de domínio

- [`Modelo de domínio`](docs/domain/modelo-de-dominio.md) — conceitos, relacionamentos, invariantes e regras de negócio.

### Decisões arquiteturais

- [`ADR-001 — Arquitetura em camadas e dependências`](docs/adr/ADR-001-arquitetura-em-camadas.md)
- [`ADR-002 — Persistência e integridade dos dados`](docs/adr/ADR-002-persistencia.md)
- [`ADR-003 — Integração com IA`](docs/adr/ADR-003-integracao-com-ia.md)
- [`ADR-004 — Segurança e tratamento de dados`](docs/adr/ADR-004-seguranca-e-dados.md)

### Orientações para agentes de IA

As instruções de trabalho e as restrições para agentes de IA devem ser consultadas no arquivo [`AGENTS.md`](AGENTS.md).

## Como utilizar esta documentação

Antes de implementar uma funcionalidade ou modificar um comportamento existente:

1. Consulte o `overview.md` para entender o contexto e os objetivos do projeto.
2. Leia a SPEC correspondente para conhecer os requisitos e critérios de aceitação.
3. Consulte o modelo de domínio para compreender as entidades, os relacionamentos e as regras de negócio.
4. Verifique os ADRs relacionados para respeitar as decisões arquiteturais aprovadas.
5. Consulte o `AGENTS.md` para seguir o fluxo de trabalho e as restrições de execução.

Quando uma necessidade não estiver especificada ou houver conflito entre documentos, não presuma uma solução. Identifique a lacuna, apresente as alternativas e solicite uma decisão antes de implementar uma mudança que dependa dela.

## Estado atual

Este repositório concentra a documentação de referência do WhoseFault.

Os requisitos funcionais, o modelo de domínio e as decisões arquiteturais são definidos em seus documentos específicos. Detalhes técnicos que ainda não foram decididos devem permanecer identificados como pendências até serem discutidos e aprovados.

A documentação deve evoluir junto com o projeto, mantendo consistência entre requisitos, regras de negócio, arquitetura e implementação.

