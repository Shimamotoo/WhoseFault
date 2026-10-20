Skill: TDD & Test Generator

Ativação

Ative esta skill quando o usuário pedir para gerar testes unitários/integração, cobrir um arquivo de código ou rodar o comando /test-generator.

Objetivo

Transformar os Critérios de Aceitação (CAs) e Regras de Negócio (RNs) definidos nas especificações em uma suíte automatizada de testes (Jest/Vitest para a API e React Testing Library para o Web).

Passos de Execução

1. Identificação de Contexto

Mapeie qual SPEC e quais Critérios de Aceitação (CAs) o código atual deve satisfazer.

Identifique a stack do arquivo em teste:

Backend (whosefault-api): Jest/Vitest, Supertest, Mocks de serviços externos.

Frontend (whosefault-web): React Testing Library, MSW (Mock Service Worker).

2. Mapeamento 1:1 de Critérios de Aceitação (CAs)

Cada teste deve se mapear diretamente a um Critério de Aceitação explícito da SPEC. Use a nomenclatura no formato: CA-[número]: [Descrição resumida do comportamento].

Exemplo:

it('CA-01: deve salvar a ocorrência com título genérico quando for criada sem descrição', async () => {
  // Arrange / Act / Assert
});


3. Princípios para Escrita dos Testes

Estrutura AAA (Arrange, Act, Assert / Dado, Quando, Então): Mantenha o fluxo legível e isolado.

Resiliência e Independência: Testes não devem depender de ordem de execução ou estado compartilhado.

Tratamento de Falhas de IA: Garanta mocks para indisponibilidade da IA (ex: timeouts, erro de quota), validando que o sistema realiza o fallback para o título genérico (Ocorrência sem descrição) conforme exigido nas RNs.

Validação de Segurança: Inclua testes garantindo que payloads e logs não expõem credenciais ou segredos.

Formato do Retorno do Gerador

Ao gerar a suíte de testes, apresente:

Lista de CAs Cobertos: Mapeamento explícito de quais Critérios de Aceitação estão sendo testados.

Código do Arquivo de Teste: Código completo e pronto para ser executado (sem omissões de imports ou partes cortadas).

Comando de Execução: Instrução de como rodar o teste (ex: npm test -- path/to/spec01.spec.ts).