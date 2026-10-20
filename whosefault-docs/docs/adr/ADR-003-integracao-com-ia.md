# ADR-003 — Integração com IA e isolamento do provedor

- **Status:** Aprovado
- **Data:** 2026-10-19

## 1. Contexto

O WhoseFault utilizará IA para gerar títulos de ocorrências e produzir diagnósticos a partir de informações técnicas e evidências.

O projeto deve evitar dependência direta de um provedor específico espalhada pelo backend. Também precisa validar respostas, controlar falhas e impedir o envio indevido de credenciais ou conteúdo desnecessário.

## 2. Decisão proposta

Manter o contrato de IA próximo dos serviços e casos de uso da aplicação.

A implementação concreta desse contrato ficará na infraestrutura, em um adaptador responsável pela comunicação com o provedor escolhido.

Os casos de uso não deverão importar diretamente SDKs de provedores, depender de formatos proprietários ou tratar respostas externas como dados confiáveis sem validação.

O contrato deverá representar as capacidades necessárias à aplicação. A geração de títulos e a geração de diagnósticos poderão ter operações distintas, ainda que compartilhem a mesma implementação de infraestrutura.

A escolha definitiva do provedor e os detalhes do contrato serão definidos antes da implementação da integração.

## 3. Alternativas consideradas

### A. Contrato no domínio

**Vantagem:** mantém o contrato próximo do modelo central da aplicação.

**Desvantagem:** pode introduzir no domínio uma abstração voltada a uma capacidade externa que é coordenada pelos casos de uso.

### B. Contrato junto aos serviços/casos de uso — recomendada

**Vantagens:** deixa explícito o que a aplicação precisa da IA, facilita testes com implementações simuladas e mantém os detalhes do provedor fora dos casos de uso.

**Desvantagens:** exige cuidado para que o contrato não se transforme em uma coleção de operações genéricas ou específicas demais de um provedor.

### C. Pasta genérica de contratos

**Vantagem:** centraliza visualmente todas as interfaces.

**Desvantagem:** pode separar contratos de suas responsabilidades e transformar a organização em um objetivo por si só.

A localização escolhida não garante, isoladamente, o baixo acoplamento; isso dependerá também das dependências e dos tipos utilizados no contrato.

## 4. Regras de comportamento

- Falha na geração de título não deverá impedir a criação da ocorrência quando a SPEC-01 determinar que ela seja salva com o título genérico.
- Falha na geração de diagnóstico não deverá apagar um diagnóstico anterior.
- Um diagnóstico anterior poderá permanecer visível, claramente marcado como desatualizado.
- Respostas inválidas não serão salvas como diagnósticos válidos.
- Uma análise válida, mas inconclusiva, será tratada como resultado legítimo, distinto de uma falha técnica.
- As chamadas à IA não serão disparadas automaticamente após mudanças nos dados.
- A geração deverá considerar alterações concorrentes e exclusões ocorridas durante a chamada.
- A integração deverá permitir testes com respostas simuladas, sem exigir chamadas reais ao provedor em todos os testes.

## 5. Segurança e dados enviados

Antes de cada chamada, o backend deverá verificar novamente os dados a serem enviados, aplicar a política de tratamento de segredos, minimizar o conteúdo e respeitar limites de tamanho.

O provedor deverá ser acessado exclusivamente pelo backend, com credenciais protegidas por variáveis de ambiente ou mecanismo equivalente adequado ao ambiente.

A resposta do provedor será considerada entrada externa não confiável e deverá passar por validação de estrutura, tipos, conteúdo e limites antes de ser persistida.

A política de privacidade e retenção do provedor escolhido deverá ser avaliada antes do envio de dados reais.

## 6. Fora do escopo

Este ADR não escolhe definitivamente OpenAI ou outro provedor, não define o formato final da resposta do diagnóstico, não fixa limites numéricos e não exige suporte simultâneo a múltiplos provedores.

## 7. Critérios para validar a decisão

- Os casos de uso não importam SDKs concretos de IA.
- A integração pode ser simulada em testes.
- Respostas inválidas não são persistidas como válidas.
- Falhas preservam os dados existentes conforme as specs.
- Nenhuma chamada é realizada antes das verificações de segurança.
