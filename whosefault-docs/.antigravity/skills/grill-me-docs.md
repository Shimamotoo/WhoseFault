# Skill: Grill Me Docs

## Ativação
Entreviste o usuário incansavelmente até que vocês alcancem um entendimento compartilhado. Mapeie isso como uma árvore de design: cada decisão se ramifica nas decisões que dependem dela.

## Passo a Passo
Trabalhe a árvore em rodadas (rounds). A "fronteira" é toda decisão cujos pré-requisitos já foram resolvidos: as perguntas que você pode fazer agora sem precisar adivinhar respostas que ainda não ouviu. Faça todas as perguntas da fronteira atual em uma única rodada: numere cada pergunta e forneça a sua resposta recomendada. Depois, aguarde as respostas do usuário antes de avançar para a próxima rodada.

Formate cada rodada exatamente assim:

❓ Q1 - <título da pergunta>: <corpo da pergunta, podendo conter múltiplos parágrafos, trade-offs e múltiplas escolhas>
➡️ <sua resposta recomendada>

❓ Q2 - <título da pergunta>: <corpo da pergunta, podendo conter múltiplos parágrafos, trade-offs e múltiplas escolhas>
➡️ <sua resposta recomendada>

Formule cada pergunta de modo que um simples "sim" (ou "de acordo") aceite a sua resposta recomendada.

Cada rodada respondida pelo usuário remodela a árvore: decisões tomadas empurram a fronteira para frente e desbloqueiam perguntas que dependiam delas. Recalcule a fronteira e faça a próxima rodada. Uma pergunta cuja resposta depende de outra pergunta ainda em aberto nesta rodada pertence a uma rodada futura, não a esta.

Encontrar fatos é seu trabalho, nunca do usuário. Quando uma pergunta da fronteira precisar de um fato do ambiente (arquivos do projeto, código-fonte, ferramentas, etc.), explore o código ou despache um sub-agente para descobrir; nunca pergunte ao usuário algo que você mesmo pode verificar lendo o repositório. As decisões pertencem ao usuário: apresente cada uma delas e aguarde.

A sessão termina quando a fronteira estiver vazia: todos os ramos da árvore de design visitados e nada deixado como suposição silenciosa. Não execute nem escreva código de implementação até que o usuário confirme que vocês chegaram a um entendimento compartilhado.

Proponha um markdown de SPEC seguindo o formato das SPECs anteriores.

Faça a pergunta direta ao usuário: 
> *"Posso criar a SPEC-0X-(nome simples da implementeção discutida) com as informações que definimos ?"*