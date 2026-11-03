# SPEC-08 — Evidências em Foto

> [!NOTE]
> **Status:** Aprovado para Implementação  
> **Dependências:** Estende [SPEC-03 (Gerenciar evidências)](SPEC-03-gerenciar-evidencias.md), [SPEC-04 (Diagnóstico de IA)](SPEC-04-diagnostico-de-ia.md) e alinha-se a [ADR-001](../adr/ADR-001-arquitetura-em-camadas.md), [ADR-003](../adr/ADR-003-integracao-com-ia.md) e [ADR-004](../adr/ADR-004-seguranca-e-dados.md).

---

## 1. Objetivo

Permitir que o desenvolvedor anexe fotos e capturas de tela (prints de ferramentas como Postman, Insomnia, DevTools, terminais ou logs visuais) como evidências técnicas de uma ocorrência. 

Os arquivos de imagem devem ser armazenados de forma segura no **Google Cloud Storage (GCP Bucket)** e convertidos sob demanda para **Base64** apenas no momento da inferência com os modelos de IA multimodal (**Google Gemini**), mantendo o banco de dados PostgreSQL enxuto e preservando a integridade e confidencialidade das investigações.

---

## 2. Escopo

Esta especificação contempla:

- Evolução do Modelo de Domínio e Banco de Dados:
- Inclusão do tipo `IMAGE` no enum `EvidenceType` no schema do Prisma e no domínio da aplicação.
- Armazenamento do caminho/URI do objeto do GCP Storage (`storagePath`) no campo `url` da entidade `Evidence`, acompanhado de notas opcionais e metadados técnicos (tipo MIME, tamanho).
- Gerenciamento de Arquivos no Google Cloud Storage (GCP):**
- Definição do contrato de serviço de armazenamento `IStorageService` na camada de domínio/aplicação.
- Implementação concreta `GcsStorageService` em `src/infra/storage` utilizando a biblioteca oficial `@google-cloud/storage`.
- Disponibilização de `StubStorageService` em memória para que a suíte de testes (Vitest) execute 100% offline, sem requisições reais ao GCP.
- Upload e Visualização de Imagens:
- Suporte a upload via requisição `multipart/form-data` no endpoint de criação de evidências da API Fastify.
- Endpoint autenticado `GET /occurrences/:id/evidences/:evidenceId/image` para transmissão segura da imagem com headers de cache.
- Remoção automática do arquivo correspondente no bucket do GCP quando a evidência ou a ocorrência for excluída.
- Diagnóstico Assistido por IA Multimodal (Gemini):
- Conversão da imagem para Base64 em tempo de execução (`inlineData`) para envio multimodal ao Gemini.
- Ajuste nas instruções de sistema (`DIAGNOSIS_SYSTEM_INSTRUCTION`) para leitura e extração técnica de informações visuais presentes nos prints.
- Manutenção do contrato estrito de resposta JSON validado via Zod (`facts_observed`, `hypotheses`, `missing_information`).
- Segurança e Proteção de Segredos:
- Aplicação do `ISecretDetector` nos textos de anotações e metadados da imagem.
- Alerta preventivo na interface orientando o usuário a não enviar prints com credenciais ou senhas expostas.
- Interface com o Usuário (Front-end):
- Formulário com zona de drag-and-drop, seleção de arquivo e pré-visualização local imediata (thumbnail).
- Validação em tempo real no navegador de tipo e tamanho de arquivo.
- Card de evidência visual com miniatura e modal de zoom em alta resolução.

Não contempla:
- Reconhecimento óptico de caracteres (OCR) prévio executado no cliente ou no servidor para mascaramento automático de pixels.
- Ferramenta interna de edição, corte (crop) ou anotação sobre a imagem no navegador.
- Persistência permanente do Base64 da imagem no banco de dados relacional.

---

## 3. Requisitos Funcionais

### RF-01 — Registro de Evidência do Tipo Imagem (POST /occurrences/:id/evidences)
- O sistema deve aceitar o envio de fotos através de requisições `multipart/form-data`.
- O payload deve conter o arquivo de imagem e, opcionalmente, notas descritivas (`notes`).
- O backend deve validar o arquivo, salvá-lo no bucket configurado do GCP Storage e persistir o registro da evidência associado à ocorrência com o tipo `IMAGE`.

### RF-02 — Validação e Restrições de Upload
- **Formatos suportados:** apenas imagens com tipos MIME `image/jpeg`, `image/png` e `image/webp`.
- **Tamanho máximo:** até 5MB (5.242.880 bytes) por arquivo.
- **Limite por ocorrência:** máximo de 5 evidências do tipo `IMAGE` por ocorrência para evitar sobrecarga de armazenamento e saturação de tokens da IA.
- Requisições que violem essas regras devem ser rejeitadas com HTTP `400 Bad Request` e mensagem descritiva.

### RF-03 — Integração e Armazenamento no GCP Cloud Storage
- Os arquivos devem ser organizados no bucket sob uma hierarquia determinística e isolada por ocorrência, ex: `occurrences/{occurrenceId}/{evidenceId}.{ext}`.
- O upload deve registrar os metadados corretos de `contentType` no GCP Storage.
- As credenciais de acesso ao bucket devem ser obtidas por meio de variáveis de ambiente (`GCS_BUCKET_NAME`) e autenticação padrão do Google Cloud (Application Default Credentials ou Service Account).

### RF-04 — Visualização e Entrega de Imagens (GET /occurrences/:id/evidences/:evidenceId/image)
- O sistema deve disponibilizar um endpoint autenticado para obter a imagem.
- Apenas usuários autorizados a acessar a ocorrência podem visualizar a imagem.
- A resposta deve transmitir o stream do arquivo com o `Content-Type` apropriado e header `Cache-Control: private, max-age=86400`.

### RF-05 — Conversão Sob Demanda para Base64 e Diagnóstico Multimodal
- Durante a execução do caso de uso de geração de diagnóstico (`generateDiagnosisUseCase`):
  - A API deve recuperar do GCP Storage os bytes de cada evidência do tipo `IMAGE` vinculada à ocorrência.
  - A imagem deve ser convertida para Base64 e injetada no payload multimodal enviado ao Gemini através do formato aceito pelo SDK:
    ```typescript
    {
      inlineData: {
        mimeType: string,
        data: string // base64 sem prefixo data:image/...
      }
    }
    ```
- O prompt de sistema do Gemini deve instruir o modelo a correlacionar os elementos visuais da imagem (status codes, mensagens de erro, parâmetros de tela) com as demais evidências textuais.
- Se a busca do arquivo falhar no storage, a IA deve prosseguir com as evidências disponíveis, registrando uma limitação em `missing_information`.

### RF-06 — Exclusão em Cascata no Storage
- Ao excluir uma evidência do tipo `IMAGE` (`DELETE /occurrences/:id/evidences/:evidenceId`), o arquivo no bucket do GCP deve ser excluído imediatamente.
- Ao excluir uma ocorrência inteira (`DELETE /occurrences/:id`), todos os arquivos de evidências de imagem pertencentes àquela ocorrência devem ser removidos do storage antes ou em conjunto com a exclusão no banco de dados.

### RF-07 — Proteção e Prevenção contra Vazamento de Segredos
- O campo textual `notes` associado à imagem deve ser obrigatoriamente inspecionado pelo `ISecretDetector`. Caso contenha credenciais, a operação de criação ou atualização deve ser rejeitada.
- A interface deve apresentar um aviso de segurança explícito orientando o usuário a verificar a captura de tela antes do envio para não expor chaves de API, senhas ou tokens visíveis na imagem.

### RF-08 — Experiência do Usuário no Front-end
- O modal de criação de evidência (`CreateEvidenceDialog`) deve apresentar a aba/opção "Imagem / Foto".
- A interface deve permitir arrastar e soltar (drag-and-drop) ou selecionar a imagem localmente.
- O front-end deve exibir uma pré-visualização (thumbnail) imediata do arquivo selecionado antes do envio, com botão para remover ou substituir o arquivo.
- Na página de detalhes da ocorrência, a evidência de imagem deve ser exibida em um card com identificador visual, miniatura clicável e opção de visualização ampliada em modal (zoom).

---

## 4. Requisitos Não Funcionais e Arquitetura

### RNF-01 — Isolamento Arquitetural (ADR-001)
- O domínio e os casos de uso não devem depender diretamente do SDK `@google-cloud/storage`.
- Todo acesso ao storage deve respeitar a interface `IStorageService`:
  ```typescript
  export interface UploadFileParams {
    occurrenceId: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }

  export interface IStorageService {
    uploadFile(params: UploadFileParams): Promise<{ storagePath: string; url: string }>;
    getFileBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string }>;
    getFileBase64(storagePath: string): Promise<{ base64: string; mimeType: string }>;
    deleteFile(storagePath: string): Promise<void>;
  }
  ```
- A implementação concreta `GcsStorageService` deve residir exclusivamente em `src/infra/storage/gcsStorageService.ts`.

### RNF-02 — Independência de Testes Automatizados
- A suíte de testes unitários e de integração (Vitest) deve utilizar `StubStorageService`, assegurando execução completa offline, determinística e veloz, sem dependência de internet ou contas ativas do GCP.

### RNF-03 — Desempenho e Eficiência de Armazenamento
- O PostgreSQL não deve armazenar payloads Base64 de imagens. O banco armazena exclusivamente referências (`storagePath`), reduzindo o consumo de espaço em disco e mantendo a velocidade das queries e backups.

### RNF-04 — Configuração por Variáveis de Ambiente
- Parâmetros como o nome do bucket devem ser fornecidos exclusivamente via variáveis de ambiente (`GCS_BUCKET_NAME`), com documentação clara no `.env.example`.

---

## 5. Critérios de Aceitação

### CA-01 — Upload de Imagem Válida com Sucesso
**Dado que** o usuário está autenticado e possui uma ocorrência aberta,  
**quando** enviar uma imagem no formato PNG de 2MB com notas descritivas via `multipart/form-data`,  
**então** a API deve salvar a imagem no bucket do GCP Storage, registrar a evidência com `type: 'IMAGE'` no banco de dados e responder com HTTP `201 Created`.

### CA-02 — Rejeição de Formato de Arquivo Inválido
**Dado que** o desenvolvedor tenta anexar um arquivo PDF ou executável como evidência de imagem,  
**quando** o backend processar a requisição de upload,  
**então** o arquivo não deve ser salvo no storage e a API deve retornar HTTP `400 Bad Request` indicando que apenas JPEG, PNG e WEBP são permitidos.

### CA-03 — Rejeição de Arquivo Acima do Limite de Tamanho
**Dado que** o desenvolvedor selecionou uma imagem de 8MB,  
**quando** o envio for acionado,  
**então** a validação (tanto no front-end quanto no back-end) deve bloquear a operação e responder HTTP `400 Bad Request` informando o limite máximo de 5MB.

### CA-04 — Visualização Autenticada da Imagem
**Dado que** uma evidência de imagem existe e pertence a uma ocorrência do usuário autenticado,  
**quando** o cliente requisitar `GET /occurrences/:id/evidences/:evidenceId/image`,  
**então** a API deve responder com HTTP `200 OK`, `Content-Type` condizente com a imagem e os bytes binários do arquivo.

### CA-05 — Diagnóstico com Inclusão Multimodal de Base64
**Dado que** uma ocorrência possui 1 evidência textual e 1 evidência do tipo `IMAGE`,  
**quando** o usuário solicitar a geração de diagnóstico assistido por IA,  
**então** o backend deve converter a imagem para Base64, transmiti-la como parte `inlineData` para a API do Gemini e gerar um diagnóstico estruturado correlacionando os fatos visuais com as evidências de texto.

### CA-06 — Limpeza de Arquivos na Exclusão da Evidência
**Dado que** uma evidência do tipo `IMAGE` possui arquivo armazenado no GCP Bucket,  
**quando** o usuário exclui essa evidência,  
**então** o registro deve ser removido do PostgreSQL e o arquivo físico correspondente deve ser excluído do bucket do GCP.

### CA-07 — Limpeza de Arquivos na Exclusão da Ocorrência
**Dado que** uma ocorrência possui múltiplas evidências com imagens no GCP Bucket,  
**quando** a ocorrência inteira for excluída pelo usuário,  
**então** todos os arquivos de imagem associados devem ser expurgados do bucket do GCP.

### CA-08 — Detecção de Segredos nas Notas da Imagem
**Dado que** o usuário preencheu as anotações da evidência com uma chave de API sensível em texto puro,  
**quando** tentar submeter o upload,  
**então** o `ISecretDetector` deve bloquear a operação, o arquivo não deve ser salvo no GCP e a API deve retornar HTTP `400 Bad Request` com instruções de sanitização.

### CA-09 — Isolamento nos Testes Unitários
**Dado que** a suíte de testes do Vitest é executada via `npm run test`,  
**quando** os testes dos casos de uso de evidência e diagnóstico forem executados,  
**então** o `StubStorageService` deve gerenciar os buffers em memória sem realizar chamadas de rede externas e todos os testes devem passar com sucesso.
