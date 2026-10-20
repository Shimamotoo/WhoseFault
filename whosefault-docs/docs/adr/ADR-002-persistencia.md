# ADR-002 — Persistência e integridade dos dados

- **Status:** Aprovado
- **Data:** 2026-10-19

## 1. Contexto

O WhoseFault precisa persistir ocorrências, evidências e diagnósticos gerados por IA.

Os registros possuem relacionamentos importantes: uma ocorrência pode possuir várias evidências e um diagnóstico atual associado. Exclusões e atualizações precisam manter esses relacionamentos consistentes.

A V1 será executada localmente via Docker, sem necessidade de hospedagem em nuvem.

## 2. Decisão proposta

Adotar PostgreSQL como banco de dados relacional da V1.

Utilizar os mecanismos de integridade do banco, incluindo chaves primárias, chaves estrangeiras, restrições e transações quando apropriado.

Operações que envolvam múltiplos registros relacionados deverão ser atômicas quando necessário para preservar a consistência dos dados.

A exclusão de uma ocorrência deverá remover definitivamente, no contexto da aplicação e do banco principal, suas evidências e seu diagnóstico associado. Não haverá lixeira nem restauração pela aplicação na V1.

A exclusão de uma evidência deverá preservar a ocorrência e as demais evidências, além de aplicar as regras já definidas para invalidar e higienizar o diagnóstico relacionado.

A persistência será acessada por meio de contratos internos adequados às necessidades dos casos de uso. Não será criada uma camada genérica para suportar diversos bancos sem necessidade concreta.

## 3. Alternativas consideradas

### A. PostgreSQL — recomendado

Banco relacional maduro, com suporte a transações, restrições de integridade e consultas relacionais.

**Vantagens:** consistência, boa adequação aos relacionamentos do domínio, execução local via Docker e prática de SQL relevante para o desenvolvimento profissional.

**Desvantagens:** exige modelagem relacional e gerenciamento de migrações.

### B. MySQL

Também atende aos relacionamentos e às transações necessárias.

**Motivo para não escolher na proposta:** não há requisito que o torne superior ao PostgreSQL para este projeto. A escolha de PostgreSQL é uma preferência técnica para a V1, não uma alegação de que MySQL seria inadequado.

### C. Banco NoSQL

Poderia oferecer flexibilidade para documentos com estruturas variáveis.

**Motivo para não adotar:** os relacionamentos e as regras de exclusão entre ocorrências, evidências e diagnósticos favorecem uma solução relacional simples.

## 4. Exclusão e consistência

- A exclusão da ocorrência e dos registros associados deverá ser executada de forma consistente.
- Restrições e regras de exclusão serão definidas para impedir registros órfãos.
- O diagnóstico não deverá manter cópias indevidas de evidências excluídas.
- A exclusão pela aplicação não será apresentada como garantia de eliminação imediata de todos os backups ou registros externos.
- A política de backups e retenção deverá ser definida antes de depender da aplicação para armazenar dados importantes.

## 5. ORM e acesso aos dados

A escolha do ORM permanece em aberto. Prisma poderá ser avaliado antes da implementação da persistência.

A escolha do PostgreSQL não implica automaticamente a aprovação do Prisma, nem exige que toda consulta seja realizada por meio de um ORM.

## 6. Fora do escopo

Este ADR não define o esquema completo das tabelas, os tipos definitivos de todos os campos, os limites de tamanho ou a política operacional de backups.

## 7. Critérios para validar a decisão

- As relações entre os registros são protegidas pelo banco.
- Exclusões relacionadas não deixam dados órfãos.
- Operações que exigem atomicidade utilizam transações apropriadas.
- Migrações e testes de persistência podem ser executados no ambiente local via Docker.
