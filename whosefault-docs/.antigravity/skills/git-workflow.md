# Skill: Git Commit & Push Workflow

## Ativação
Ative esta skill quando o usuário pedir para salvar as alterações, fazer commit, subir o código ou rodar o comando `/commit`.

## Passo a Passo

### 1. Inspeção de Alterações
1. Rode `git status` no terminal para identificar arquivos modificados, criados ou deletados.
2. Rode `git diff` nos arquivos modificados para entender exatamente o que mudou.
3. Garanta que arquivos de ambiente (`.env`, `.env.local`) ou segredos NÃO estejam na staging area.

### 2. Formatação da Mensagem (Conventional Commits)
Gere uma mensagem em português claro seguindo o padrão:
- `feat:` para novas funcionalidades.
- `fix:` para correção de bugs.
- `docs:` para alterações em documentação/specs.
- `refactor:` para melhorias de código sem alterar comportamento.
- `test:` para adição ou ajuste de testes.

### 3. Pedido de Confirmação (Pausa Obrigatória)
Antes de executar qualquer comando de alteração no Git, apresente no chat:
- A lista de arquivos modificados que serão incluídos.
- A mensagem de commit sugerida (padrão Conventional Commits).

Faça a pergunta direta ao usuário: 
> *"Posso realizar o commit e o push das alterações acima?"*

**Aguarde a resposta explícita do usuário antes de rodar os comandos no terminal.**

### 4. Execução (Apenas após a aprovação)
Após receber o "Sim" ou "Aprovado":
1. `git add .` (ou os arquivos selecionados)
2. `git commit -m "mensagem aprovada"`
3. `git push origin <nome-da-branch>`