# WhoseFault

O **WhoseFault** é uma ferramenta voltada à investigação de falhas, comportamentos inesperados e erros de integração com APIs, centralizando ocorrências, evidências técnicas estruturadas e diagnósticos assistidos por inteligência artificial.

O projeto foi concebido com forte foco em boas práticas de engenharia de software, modelagem de domínio, arquitetura em camadas, testes automatizados e uso responsável e seguro de IA.

---

## 🎯 Objetivos e Problema Resolvido

Ao integrar com serviços e APIs de terceiros, desenvolvedores frequentemente se deparam com documentações imprecisas, mensagens de erro genéricas e respostas inesperadas. As informações de chamadas, headers, payloads e logs acabam espalhadas em diferentes ferramentas.

O **WhoseFault** centraliza esse processo:
- **Registro Estruturado de Ocorrências:** Cadastro da API, método HTTP, URL e descrição do problema com geração de título curto assistida por IA.
- **Gerenciamento de Evidências Técnicas:** Associação de requisições HTTP, respostas, logs de erro e anotações manuais em fonte monoespaçada.
- **Diagnóstico Assistido por IA:** Levantamento estruturado de fatos observados, hipóteses fundamentadas e informações ausentes, com detecção automática de estado desatualizado quando novas evidências são incluídas.
- **Secret Guardrail & Sanitização:** Bloqueio conservador de credenciais, chaves de API e segredos na borda (`HTTP 422`) e *double-check* prévio ao envio para o provedor de IA.

---

## 🏗️ Estrutura do Monorepo

O projeto está organizado como um monorepo com três pacotes principais:

| Pacote | Descrição | Stack Principal |
|---|---|---|
| [`whosefault-docs`](whosefault-docs/) | Documentação de engenharia, especificações (SPECs), decisões arquiteturais (ADRs) e modelo de domínio. | Markdown / SDD |
| [`whosefault-api`](whosefault-api/) | Backend da aplicação com arquitetura em camadas e regras de negócio isoladas. | Node.js, Fastify, TypeScript, Prisma, Vitest |
| [`whosefault-web`](whosefault-web/) | Frontend da aplicação integrado à API e ao banco relacional. | React 19, TypeScript, Vite, Tailwind CSS, Radix UI |

---

## 🏛️ Arquitetura e Decisões Técnicas

O backend segue as diretrizes do [ADR-001](whosefault-docs/docs/adr/ADR-001-arquitetura-em-camadas.md), organizado em quatro responsabilidades com dependências estritamente controladas:

1. **HTTP / Apresentação (`http`):** Recebe requisições, valida entradas na fronteira da API e transforma resultados em respostas HTTP.
2. **Aplicação / Casos de Uso (`application`):** Coordena os fluxos de negócio da aplicação via contratos internos (interfaces/ports).
3. **Domínio (`domain`):** Entidades e regras de negócio puras, completamente desacopladas de frameworks, banco de dados ou SDKs externos.
4. **Infraestrutura (`infra`):** Implementações concretas de persistência com Prisma (PostgreSQL) e adaptadores para o provedor de IA (Google Gemini).

### Decisões Arquiteturais Registradas (ADRs):
- [ADR-001 — Arquitetura em camadas e dependências](whosefault-docs/docs/adr/ADR-001-arquitetura-em-camadas.md)
- [ADR-002 — Persistência e integridade dos dados (PostgreSQL + Prisma)](whosefault-docs/docs/adr/ADR-002-persistencia.md)
- [ADR-003 — Integração com IA e isolamento do provedor](whosefault-docs/docs/adr/ADR-003-integracao-com-ia.md)
- [ADR-004 — Segurança e tratamento de dados sensíveis (Secret Guard)](whosefault-docs/docs/adr/ADR-004-seguranca-e-dados.md)

---

## 📋 Especificações da V1 e Status de Atendimento

Todas as especificações previstas para a V1 foram implementadas e validadas:

| Especificação | Escopo Principal | Status na V1 |
|---|---|:---:|
| [SPEC-01 — Registrar ocorrência](whosefault-docs/docs/specs/SPEC-01-registrar-ocorrencia.md) | Cadastro e edição de ocorrências de integração, geração de título curto por IA e persistência relacional. | **100% Concluído** |
| [SPEC-02 — Consultar ocorrências](whosefault-docs/docs/specs/SPEC-02-consultar-ocorrencias.md) | Listagem ordenada por criação, visualização de detalhes, badges de método HTTP e empty state. | **100% Concluído** |
| [SPEC-03 — Gerenciar evidências](whosefault-docs/docs/specs/SPEC-03-gerenciar-evidencias.md) | 4 tipos de evidências (requisição, resposta, logs, notas), exclusão confirmada e Secret Guardrail. | **100% Concluído** |
| [SPEC-04 — Diagnóstico de IA](whosefault-docs/docs/specs/SPEC-04-diagnostico-de-ia.md) | Análise assistida por IA (fatos, hipóteses e informações faltantes), double-check e invalidação dinâmica. | **100% Concluído** |
| [Modelo de Domínio](whosefault-docs/docs/domain/modelo-de-dominio.md) | Entidades puras `Occurrence`, `Evidence` e `Diagnosis` desacopladas de infraestrutura. | **100% Concluído** |

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js** (v20+ recomendado) e **npm**
- **Docker** e **Docker Compose** (para o PostgreSQL)
- Chave de API da Google Gemini (opcional, para geração real de títulos e diagnósticos via IA)

---

### 1. Inicializar o Banco de Dados (PostgreSQL)

Na raiz do repositório, inicie o container PostgreSQL:

```bash
docker compose up -d
```

O container expõe a porta `5432` com as configurações definidas em `docker-compose.yml`.

---

### 2. Configurar e Executar o Backend (`whosefault-api`)

```bash
# Entrar no diretório da API
cd whosefault-api

# Configurar variáveis de ambiente (copiar o exemplo)
cp .env.example .env

# Executar as migrações do banco de dados (Prisma)
npm run db:deploy

# Rodar a suíte completa de testes automatizados (105 testes unitários e de integração)
npm test

# Iniciar o servidor HTTP em modo de desenvolvimento (porta 3333)
npm run dev
```

O servidor Fastify estará disponível em `http://localhost:3333/api`.

---

### 3. Configurar e Executar o Frontend (`whosefault-web`)

Em outro terminal:

```bash
# Entrar no diretório do Frontend
cd whosefault-web

# Verificar tipagem e linting
npm run lint
npm run build

# Iniciar o servidor de desenvolvimento Vite (porta 5173)
npm run dev
```

Acesse a interface gráfica no navegador em **`http://localhost:5173`**.

---

## 🧪 Comandos Úteis e Validação de Qualidade

### Backend (`whosefault-api`)
- `npm test`: Executa todos os testes unitários e de integração com PostgreSQL (Vitest).
- `npm run test:unit`: Executa apenas os testes unitários da camada de domínio e aplicação.
- `npm run typecheck`: Validação estrita de tipos com `tsc --noEmit`.
- `npm run db:studio`: Abre o Prisma Studio para inspeção visual do banco de dados.

### Frontend (`whosefault-web`)
- `npm run build`: Compila o TypeScript e gera o bundle de produção Vite.
- `npm run lint`: Checagem estática de código com Oxlint.

---

## 🧭 Diretrizes para Agentes e Colaboradores

As instruções de governança, restrições e fluxo de trabalho técnico estão detalhadas em [`whosefault-docs/AGENTS.md`](whosefault-docs/AGENTS.md).
