import type { Diagnosis, Evidence, Occurrence } from "@/types/domain";

export const INITIAL_OCCURRENCES: Occurrence[] = [
  {
    id: "occ-stripe-webhook-500",
    apiName: "Stripe Billing API v1",
    method: "POST",
    url: "https://api.stripe.com/v1/webhook_endpoints/we_99f8a7b6c5d4e3f2/events",
    title: "Falha 500 por dessincronia de timestamp na assinatura HMAC do Webhook",
    description:
      "Durante o processamento do evento customer.subscription.updated em produção, o endpoint de validação do gateway retorna HTTP 500 intermitente quando o payload possui metadados aninhados com caracteres UTF-8 escapados e mais de 12KB.",
    createdAt: "2026-10-26T14:20:00.000Z",
    updatedAt: "2026-10-26T14:42:00.000Z",
  },
  {
    id: "occ-github-graphql-rate",
    apiName: "GitHub REST & Actions API",
    method: "GET",
    url: "https://api.github.com/repos/org-internal/core-platform-monorepo/actions/runs?per_page=100&status=in_progress",
    title: "Bloqueio 403 Secondary Rate Limit em polling concorrente de Actions",
    description:
      "O worker de sincronização de pipelines começou a receber HTTP 403 Forbidden mesmo com x-ratelimit-remaining acima de 3.200 requisições restantes na janela primária.",
    createdAt: "2026-10-25T19:12:00.000Z",
    updatedAt: "2026-10-25T19:15:00.000Z",
  },
  {
    id: "occ-legacy-erp-timeout",
    apiName: "SAP S/4HANA Inventory Gateway",
    method: "PUT",
    url: "https://erp-gateway.internal.corp.local:8443/v2/inventory/allocations/sync-batch",
    title: "Ocorrência sem descrição",
    description: undefined,
    createdAt: "2026-10-24T11:05:00.000Z",
    updatedAt: "2026-10-24T11:05:00.000Z",
  },
  {
    id: "occ-auth0-delete-session",
    apiName: "Auth0 Management API v2",
    method: "DELETE",
    url: "https://tenant-prod.us.auth0.com/api/v2/users/auth0%7C65f1a2b3c4d5e6f7/sessions",
    title: "Ocorrência sem descrição",
    description:
      "A chamada de revogação de sessões retorna 204 No Content, porém o refresh token permanece ativo por mais 15 minutos nos nós secundários do cluster US-East.",
    createdAt: "2026-10-23T09:30:00.000Z",
    updatedAt: "2026-10-23T09:45:00.000Z",
  },
];

export const INITIAL_EVIDENCES: Record<string, Evidence[]> = {
  "occ-stripe-webhook-500": [
    {
      id: "ev-stripe-req-01",
      occurrenceId: "occ-stripe-webhook-500",
      type: "HTTP_REQUEST",
      method: "POST",
      url: "https://api.stripe.com/v1/webhook_endpoints/we_99f8a7b6c5d4e3f2/events",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Stripe-Signature": "t=1729952400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd",
        "Idempotency-Key": "idem_sub_update_9823418923",
        "User-Agent": "WhoseFault-BillingWorker/2.4.1 (Node.js/22.9.0)",
      },
      payload: JSON.stringify(
        {
          id: "evt_3Q9xYz2eZvKYlo2C0a1b2c3d",
          object: "event",
          api_version: "2024-06-20",
          created: 1729952398,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: "sub_1Q9xYx2eZvKYlo2C9z8y7x6w",
              customer: "cus_R1a2b3c4d5e6f7",
              status: "past_due",
              collection_method: "charge_automatically",
              metadata: {
                tenant_region: "sa-east-1",
                billing_cycle_anchor_override: "true",
                reconciliation_trace:
                  "trace-id=8f9e2b1c-4d3a-4e5f-9a8b-7c6d5e4f3a2b;partition=br-sp-04;retry_count=3;raw_body_canonicalized=false",
              },
            },
          },
        },
        null,
        2,
      ),
      notes:
        "O middleware Express está aplicando JSON.parse antes de repassar o buffer para o validador de assinatura em rotas com compressão gzip habilitada.",
      createdAt: "2026-10-26T14:22:10.000Z",
      updatedAt: "2026-10-26T14:22:10.000Z",
    },
    {
      id: "ev-stripe-res-02",
      occurrenceId: "occ-stripe-webhook-500",
      type: "HTTP_RESPONSE",
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Request-Id": "req_LK92mN81pQ74xZ",
        "Stripe-Version": "2024-06-20",
        "Cache-Control": "no-cache, no-store",
      },
      body: JSON.stringify(
        {
          error: {
            code: "webhook_signature_verification_failed",
            doc_url: "https://stripe.com/docs/webhooks/signatures",
            message:
              "No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? Serialized JSON keys order differed at byte offset 384.",
            type: "invalid_request_error",
          },
        },
        null,
        2,
      ),
      notes: "Retornado após 412ms quando o body contém campos UTF-8 reordenados pelo parser intermediário.",
      createdAt: "2026-10-26T14:24:05.000Z",
      updatedAt: "2026-10-26T14:24:05.000Z",
    },
    {
      id: "ev-stripe-log-03",
      occurrenceId: "occ-stripe-webhook-500",
      type: "ERROR_LOG",
      content: `[2026-10-26T14:24:04.918Z] ERROR (billing-webhook-worker/48219 on pod-billing-7c9f8b6d4-x2k9p):
WebhookSignatureVerificationError: Computed HMAC-SHA256 digest mismatch
    at verifyHeader (file:///app/dist/infra/http/stripeSignatureVerifier.js:88:15)
    at WebhookController.handleEvent (file:///app/dist/http/controllers/webhookController.js:42:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
Caused by: RawBodyBufferUnavailableError: req.rawBody is undefined; fallback JSON.stringify(req.body) mutated whitespace and unicode escape sequences (\\u00e7 -> ç).
Context: { "requestId": "req_LK92mN81pQ74xZ", "contentLength": 14208, "contentEncoding": "gzip", "skewMs": 2140 }`,
      context: "Coletado do container billing-webhook-worker no cluster Kubernetes (namespace prod-payments).",
      createdAt: "2026-10-26T14:35:00.000Z",
      updatedAt: "2026-10-26T14:35:00.000Z",
    },
    {
      id: "ev-stripe-note-04",
      occurrenceId: "occ-stripe-webhook-500",
      type: "MANUAL_NOTE",
      content:
        "Adicionada evidência após o primeiro diagnóstico: confirmamos que requisições sem compressão gzip (menores que 1KB) passam pelo rawBody normalmente, mas o Ingress NGINX descompacta payloads > 8KB e o body-parser global consome a stream antes do hook da rota.",
      createdAt: "2026-10-26T14:42:00.000Z",
      updatedAt: "2026-10-26T14:42:00.000Z",
    },
  ],
  "occ-github-graphql-rate": [
    {
      id: "ev-gh-req-01",
      occurrenceId: "occ-github-graphql-rate",
      type: "HTTP_REQUEST",
      method: "GET",
      url: "https://api.github.com/repos/org-internal/core-platform-monorepo/actions/runs?per_page=100&status=in_progress",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "WhoseFault-CIPoller/1.1.0",
      },
      notes: "Executado em paralelo por 12 réplicas a cada 5 segundos.",
      createdAt: "2026-10-25T19:13:00.000Z",
      updatedAt: "2026-10-25T19:13:00.000Z",
    },
    {
      id: "ev-gh-res-02",
      occurrenceId: "occ-github-graphql-rate",
      type: "HTTP_RESPONSE",
      statusCode: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": "60",
        "X-RateLimit-Limit": "5000",
        "X-RateLimit-Remaining": "3412",
        "X-RateLimit-Resource": "core",
      },
      body: JSON.stringify(
        {
          message:
            "You have exceeded a secondary rate limit and have been temporarily blocked from content creation. Please wait a few minutes before you try again.",
          documentation_url:
            "https://docs.github.com/en/free-pro-team@latest/rest/overview/resources-in-the-rest-api#secondary-rate-limits",
        },
        null,
        2,
      ),
      notes: "O cabeçalho Retry-After=60 está presente mas não estava sendo tratado pelo cliente HTTP.",
      createdAt: "2026-10-25T19:14:00.000Z",
      updatedAt: "2026-10-25T19:14:00.000Z",
    },
  ],
  "occ-legacy-erp-timeout": [],
  "occ-auth0-delete-session": [
    {
      id: "ev-auth0-res-01",
      occurrenceId: "occ-auth0-delete-session",
      type: "HTTP_RESPONSE",
      statusCode: 204,
      headers: {
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "94",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
      },
      notes: "Resposta HTTP 204 sem corpo retornada imediatamente pelo endpoint de deleção de sessões.",
      createdAt: "2026-10-23T09:35:00.000Z",
      updatedAt: "2026-10-23T09:35:00.000Z",
    },
  ],
};

export const INITIAL_DIAGNOSES: Record<string, Diagnosis> = {
  "occ-stripe-webhook-500": {
    id: "diag-stripe-001",
    occurrenceId: "occ-stripe-webhook-500",
    isOutdated: true,
    createdAt: "2026-10-26T14:36:00.000Z",
    updatedAt: "2026-10-26T14:42:00.000Z",
    result: {
      facts_observed: [
        "A resposta HTTP 500 indica erro 'webhook_signature_verification_failed' com divergência no offset de byte 384.",
        "O log de erro confirma que 'req.rawBody' está undefined e o sistema realizou fallback para 'JSON.stringify(req.body)'.",
        "O payload contém sequências Unicode que foram convertidas durante o parse e re-serialização JSON.",
      ],
      hypotheses: [
        {
          cause:
            "Re-serialização do corpo da requisição via JSON.stringify(req.body) altera a representação binária original usada pelo Stripe para calcular o HMAC-SHA256.",
          evidence_support:
            "Sustentado pelo ERROR_LOG ('req.rawBody is undefined; fallback JSON.stringify(req.body) mutated whitespace and unicode escape sequences') e pela HTTP_RESPONSE 500.",
        },
        {
          cause:
            "Middleware de body-parser global está consumindo a stream HTTP antes do coletor de rawBuffer na rota de webhooks.",
          evidence_support:
            "Sustentado pelas notas da HTTP_REQUEST e pela observação manual sobre payloads descompactados pelo Ingress.",
        },
      ],
      missing_information: [
        "Ordem exata de registro dos middlewares no arquivo de bootstrap do servidor HTTP.",
        "Configuração de proxy/gzip do Ingress NGINX para confirmar se o cabeçalho Content-Length é reescrito.",
      ],
    },
  },
  "occ-github-graphql-rate": {
    id: "diag-gh-002",
    occurrenceId: "occ-github-graphql-rate",
    isOutdated: false,
    createdAt: "2026-10-25T19:15:00.000Z",
    updatedAt: "2026-10-25T19:15:00.000Z",
    result: {
      facts_observed: [
        "A API retornou HTTP 403 com a mensagem explícita 'You have exceeded a secondary rate limit' e cabeçalho Retry-After: 60.",
        "A cota primária ainda possuía 3.412 de 5.000 requisições disponíveis (X-RateLimit-Remaining: 3412).",
        "12 réplicas executam polling concorrente com per_page=100 a cada 5 segundos.",
      ],
      hypotheses: [
        {
          cause:
            "Excesso de requisições concorrentes simultâneas das 12 réplicas acionou o limite secundário de concorrência da API do GitHub, independente da cota horária.",
          evidence_support:
            "Sustentado pelo corpo da HTTP_RESPONSE 403, presença do header Retry-After: 60 e nota da HTTP_REQUEST indicando 12 réplicas sem jitter.",
        },
      ],
      missing_information: [
        "Confirmar se é possível substituir o polling de 5s por Webhooks do evento workflow_run.",
      ],
    },
  },
};
