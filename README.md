# WhoseFault

O **WhoseFault** é uma ferramenta voltada à investigação de falhas, comportamentos inesperados e erros de integração com APIs, reunindo ocorrências, evidências técnicas e diagnósticos assistidos por inteligência artificial.

O projeto foi concebido com forte foco em boas práticas de engenharia de software, modelagem de domínio, arquitetura em camadas, testes automatizados e uso responsável de IA.

---

## 🎯 Objetivos e Problema Resolvido

Ao integrar com serviços e APIs de terceiros, desenvolvedores frequentemente se deparam com documentações imprecisas, mensagens de erro genéricas e respostas inesperadas. As informações de chamadas, headers, payloads e logs acabam espalhadas em diferentes ferramentas.

O **WhoseFault** centraliza esse processo:
- **Registro Estruturado de Ocorrências:** Cadastro da API, método HTTP, URL e descrição do problema.
- **Gerenciamento de Evidências Técnicas:** Associação de requisições, respostas, logs e observações manuais.
- **Diagnóstico Assistido por IA:** Levantamento de hipóteses fundamentadas com indicação de incertezas e limitações, sem ações autônomas arriscadas.
- **Proteção e Sanitização de Dados:** Bloqueio conservador de credenciais, chaves de API e segredos antes da persistência ou envio à IA.

---

## 🏗️ Estrutura do Monorepo

O projeto está organizado como um monorepo com três pacotes principais:

| Pacote | Descrição | Stack Principal |
|---|---|---|
| [`whosefault-docs`](whosefault-docs/) | Documentação de engenharia, especificações (SPECs), decisões arquiteturais (ADRs) e modelo de domínio. | Markdown / SDD |
| [`whosefault-api`](whosefault-api/) | Backend da aplicação com arquitetura em camadas e regras de negócio isoladas. | Node.js, TypeScript, Vitest |
| [`whosefault-web`](whosefault-web/) | Frontend da aplicação (interface do usuário). | React, TypeScript *(próximas etapas)* |

---

## 🏛️ Arquitetura e Decisões Técnicas

O backend segue as diretrizes do [ADR-001](whosefault-docs/docs/adr/ADR-001-arquitetura-em-camadas.md), organizado em quatro responsabilidades com dependências controladas:

1. **HTTP / Apresentação (`http`):** Recebe requisições, valida entradas na fronteira da API e transforma resultados em respostas HTTP.
2. **Aplicação / Casos de Uso (`application`):** Coordena os fluxos de negócio da aplicação via contratos internos (interfaces/ports).
3. **Domínio (`domain`):** Entidades e regras de negócio puras, completamente desacopladas de frameworks, banco de dados ou SDKs externos.
4. **Infraestrutura (`infrastructure`):** Implementações concretas de persistência e adaptadores de integração com serviços externos.

### Decisões Arquiteturais Registradas (ADRs):
- [ADR-001 — Arquitetura em camadas e dependências](whosefault-docs/docs/adr/ADR-001-arquitetura-em-camadas.md)
- [ADR-002 — Persistência e integridade dos dados (PostgreSQL)](whosefault-docs/docs/adr/ADR-002-persistencia.md)
- [ADR-003 — Integração com IA e isolamento do provedor](whosefault-docs/docs/adr/ADR-003-integracao-com-ia.md)
- [ADR-004 — Segurança e tratamento de dados sensíveis](whosefault-docs/docs/adr/ADR-004-seguranca-e-dados.md)

---

## 📋 Especificações da V1

- [SPEC-01 — Registrar ocorrência](whosefault-docs/docs/specs/SPEC-01-registrar-ocorrencia.md)
- [SPEC-02 — Consultar ocorrências](whosefault-docs/docs/specs/SPEC-02-consultar-ocorrencias.md)
- [SPEC-03 — Gerenciar evidências](whosefault-docs/docs/specs/SPEC-03-gerenciar-evidencias.md)
- [Modelo de Domínio](whosefault-docs/docs/domain/modelo-de-dominio.md)

---

## 🚀 Como Executar o Backend (`whosefault-api`)

### Pré-requisitos
- Node.js (v20+ recomendado)
- npm

### Instalação e Execução de Testes
```bash
# Entrar no diretório da API
cd whosefault-api

# Executar a suíte de testes unitários (Vitest)
npm test

# Executar a verificação estrita de tipagem (TypeScript)
npm run typecheck

# Gerar build de produção
npm run build
```

---

## 🧭 Diretrizes para Agentes e Colaboradores

As instruções de governança, restrições e fluxo de trabalho técnico estão detalhadas em [`whosefault-docs/AGENTS.md`](whosefault-docs/AGENTS.md).
