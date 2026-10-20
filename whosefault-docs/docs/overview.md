# WhoseFault — Overview

## 1. Problema

Desenvolvedores que utilizam APIs podem encontrar erros e comportamentos inesperados difíceis de investigar, especialmente ao integrar serviços de terceiros com documentação incompleta, pouco clara ou inexistente. Mensagens de erro genéricas e a falta de informações sobre as causas das falhas dificultam a compreensão do comportamento dessas APIs.

Durante uma investigação, informações como requisições, respostas, mensagens de erro e hipóteses podem ficar dispersas entre diferentes ferramentas, dificultando a análise e a consulta posterior.

O WhoseFault tem como objetivo oferecer um espaço estruturado para registrar essas ocorrências, reunir evidências e auxiliar o desenvolvedor a compreender possíveis causas dos problemas encontrados durante a integração com APIs.

## 2. Público-alvo da V1

A V1 será direcionada a desenvolvedores que utilizam ou integram APIs e precisam investigar erros ou comportamentos inesperados.

Inicialmente, o sistema será desenvolvido para uso individual, sem exigir colaboração entre equipes.

## 3. Critério de sucesso da V1

A V1 será considerada bem-sucedida quando um desenvolvedor conseguir:

- Registrar uma ocorrência relacionada ao uso de uma API.
- Documentar os dados relevantes da chamada HTTP e a resposta recebida, quando disponíveis.
- Reunir evidências e registrar informações relacionadas à investigação.
- Solicitar uma análise da ocorrência por meio de um assistente de diagnóstico baseado em inteligência artificial.
- Receber possíveis causas acompanhadas das evidências que as sustentam e das incertezas identificadas.
- Consultar posteriormente as informações registradas e os resultados da análise.

O sistema deverá manter as informações associadas à ocorrência correta e permitir que uma investigação permaneça inconclusiva quando não houver evidências suficientes para determinar uma causa.

## 4. Limites da V1

A V1 terá como foco o registro de ocorrências e a investigação assistida de problemas relacionados a APIs.

Os seguintes limites serão adotados:

- O desenvolvedor registrará manualmente as informações da chamada HTTP e da resposta obtida por outras ferramentas ou pelo próprio código.
- O WhoseFault não executará requisições HTTP para a API investigada.
- A inteligência artificial atuará como assistente de diagnóstico, sugerindo possíveis causas com base nas informações fornecidas.
- A IA não conduzirá investigações autônomas nem executará ações para corrigir os problemas.
- As hipóteses apresentadas pela IA não serão tratadas automaticamente como causas confirmadas.
- O sistema deverá proteger credenciais, tokens, chaves de API e outros dados sensíveis durante o registro e o processamento das informações.

## 5. Visão futura

O WhoseFault poderá evoluir para oferecer recursos mais avançados de investigação, incluindo análise de múltiplas chamadas e evidências relacionadas, consulta à documentação das APIs investigadas e solicitação de informações adicionais ao desenvolvedor.

A inteligência artificial poderá assumir um papel mais ativo no processo, conduzindo etapas de investigação, identificando informações ausentes e sugerindo soluções específicas, sempre apresentando as evidências e incertezas relevantes.

O objetivo de longo prazo é reduzir o tempo necessário para compreender e resolver problemas de integração com APIs, sem substituir a capacidade de avaliação do desenvolvedor.
