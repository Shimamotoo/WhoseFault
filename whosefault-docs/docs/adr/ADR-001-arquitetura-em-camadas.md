# ADR-001 — Arquitetura em camadas e dependências

- **Status:** Aprovado
- **Data:** 2026-10-19

## 1. Contexto

O WhoseFault é uma aplicação para registrar ocorrências relacionadas a APIs, gerenciar evidências técnicas e utilizar IA para auxiliar na investigação de problemas.

O backend será desenvolvido com Node.js e TypeScript. Precisamos manter as regras de negócio independentes das tecnologias utilizadas para comunicação HTTP, persistência e integração com IA.

Também queremos facilitar os testes e reduzir o impacto de mudanças tecnológicas sem criar abstrações desnecessárias para a V1.

## 2. Decisão proposta

Organizar o backend em quatro responsabilidades principais:

1. **HTTP / apresentação:** recebe requisições, valida entradas no limite da API e transforma resultados em respostas HTTP.
2. **Aplicação / casos de uso:** coordena operações como criar ocorrência, gerenciar evidências, excluir registros e gerar diagnósticos.
3. **Domínio:** contém entidades, regras de negócio e invariantes independentes de HTTP, banco de dados e SDKs externos.
4. **Infraestrutura:** implementa os detalhes concretos de persistência e integração com serviços externos, incluindo o provedor de IA.

Os casos de uso dependerão de contratos internos para operações externas, em vez de dependerem diretamente de implementações concretas.

As entidades poderão proteger suas próprias regras e invariantes. Operações que coordenam múltiplas entidades ou dependências externas ficarão nos casos de uso ou serviços de aplicação.

Interfaces e abstrações serão criadas quando houver uma fronteira real de responsabilidade, necessidade de substituição ou benefício relevante para testes. Não será criada uma interface para cada classe por padrão.

## 3. Alternativas consideradas

### A. Backend organizado apenas por tecnologia

Controllers, services, models, repositories e routes seriam organizados principalmente por tipo técnico, sem fronteiras explícitas de dependência.

**Vantagens:** estrutura inicialmente familiar e simples.

**Desvantagens:** aumenta o risco de regras de negócio ficarem espalhadas e de serviços dependerem diretamente de tecnologias externas.

### B. Arquitetura em camadas com dependências controladas — recomendada

As responsabilidades são separadas e as dependências externas são acessadas por contratos internos.

**Vantagens:** facilita testes isolados, manutenção e substituição de implementações.

**Desvantagens:** exige compreender e manter algumas fronteiras e contratos adicionais.

### C. Arquitetura distribuída ou baseada em microserviços

Separar domínio, persistência e IA em serviços independentes.

**Motivo para não adotar na V1:** adicionaria complexidade operacional e de comunicação sem uma necessidade atual demonstrada.

## 4. Consequências

- As regras de domínio poderão ser testadas sem banco de dados ou servidor HTTP.
- Os casos de uso poderão ser testados com dependências simuladas.
- Os controllers não deverão concentrar regras de negócio.
- O domínio não deverá importar Express, Prisma, drivers de banco ou SDKs de IA.
- Mudanças de tecnologia poderão exigir ajustes nos adaptadores e contratos, mas não deverão exigir reescrever toda a aplicação.
- A arquitetura deverá permanecer proporcional às necessidades da V1.

## 5. Fora do escopo

Este ADR não define a estrutura exata de todas as pastas, a lista definitiva de classes, o ORM ou os detalhes de cada endpoint. Esses pontos serão definidos conforme necessário, respeitando as fronteiras aprovadas.

## 6. Critérios para validar a decisão

- Regras de domínio podem ser testadas sem infraestrutura.
- Casos de uso não dependem diretamente de SDKs ou drivers concretos.
- Cada camada tem responsabilidades compreensíveis.
- Não existem abstrações genéricas sem justificativa identificável.
