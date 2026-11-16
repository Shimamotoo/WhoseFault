import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhoseFaultClient } from '../src/client.js';
import { createWhoseFaultMcpServer } from '../src/server.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TEST_API_URL = 'http://localhost:3333/api';
const TEST_TOKEN = 'secret-test-bearer-token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createConnectedTestRig(fetchHandler: typeof fetch) {
  const fetchMock = vi.fn(fetchHandler);
  const apiClient = new WhoseFaultClient({
    apiUrl: TEST_API_URL,
    apiToken: TEST_TOKEN,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  const server = createWhoseFaultMcpServer(apiClient);
  const client = new Client({ name: 'test-mcp-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    fetchMock,
    close: async () => {
      await Promise.all([client.close(), server.close()]);
    },
  };
}

describe('whosefault-mcp server (SPEC-09)', () => {
  const cleanupCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const fn = cleanupCallbacks.pop();
      if (fn) {
        await fn();
      }
    }
    vi.restoreAllMocks();
  });

  it('registers all 6 tools, 2 resources (static + template) and 1 prompt', async () => {
    const rig = await createConnectedTestRig(async () => jsonResponse({}));
    cleanupCallbacks.push(rig.close);

    const [toolsRes, resourcesRes, templatesRes, promptsRes] = await Promise.all([
      rig.client.listTools(),
      rig.client.listResources(),
      rig.client.listResourceTemplates(),
      rig.client.listPrompts(),
    ]);

    expect(toolsRes.tools.map((t) => t.name).sort()).toEqual([
      'add_evidence',
      'create_occurrence',
      'generate_diagnosis',
      'get_evidence_image',
      'get_occurrence_details',
      'list_occurrences',
    ]);

    expect(resourcesRes.resources).toHaveLength(1);
    expect(resourcesRes.resources[0]).toMatchObject({
      uri: 'whosefault://occurrences',
      mimeType: 'application/json',
    });

    expect(templatesRes.resourceTemplates).toHaveLength(1);
    expect(templatesRes.resourceTemplates[0]).toMatchObject({
      uriTemplate: 'whosefault://occurrences/{id}',
      mimeType: 'application/json',
    });

    expect(promptsRes.prompts).toHaveLength(1);
    expect(promptsRes.prompts[0]).toMatchObject({
      name: 'investigate_occurrence',
      arguments: [{ name: 'occurrenceId', required: true }],
    });
  });

  it('lists occurrences and fetches details with diagnosis: null when /diagnosis returns 404 (CA-02)', async () => {
    const sampleOccurrence = {
      id: 'occ-1',
      apiName: 'Stripe',
      method: 'POST',
      url: 'https://api.stripe.com/v1/charges',
      title: 'Erro 502 na criação de cobrança',
      description: 'Gateway timeout',
      createdAt: '2026-11-16T10:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
    };

    const sampleEvidence = {
      id: 'ev-1',
      occurrenceId: 'occ-1',
      type: 'HTTP_RESPONSE',
      statusCode: 502,
      body: '{"error":"bad_gateway"}',
      createdAt: '2026-11-16T10:01:00.000Z',
      updatedAt: '2026-11-16T10:01:00.000Z',
    };

    const rig = await createConnectedTestRig(async (input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${TEST_TOKEN}`);

      const url = String(input);
      if (url === `${TEST_API_URL}/occurrences`) {
        return jsonResponse({ occurrences: [sampleOccurrence] });
      }
      if (url === `${TEST_API_URL}/occurrences/occ-1`) {
        return jsonResponse(sampleOccurrence);
      }
      if (url === `${TEST_API_URL}/occurrences/occ-1/evidences`) {
        return jsonResponse({ evidences: [sampleEvidence] });
      }
      if (url === `${TEST_API_URL}/occurrences/occ-1/diagnosis`) {
        return jsonResponse({ error: 'Nenhum diagnóstico encontrado para esta ocorrência.' }, 404);
      }
      return jsonResponse({ error: 'Unexpected URL' }, 500);
    });
    cleanupCallbacks.push(rig.close);

    const listResult = await rig.client.callTool({ name: 'list_occurrences', arguments: {} });
    expect(listResult.isError).toBeFalsy();
    expect(listResult.content[0]).toMatchObject({ type: 'text' });
    const parsedList = JSON.parse((listResult.content[0] as { text: string }).text);
    expect(parsedList).toEqual([sampleOccurrence]);

    const detailsResult = await rig.client.callTool({
      name: 'get_occurrence_details',
      arguments: { occurrenceId: 'occ-1' },
    });
    expect(detailsResult.isError).toBeFalsy();
    const parsedDetails = JSON.parse((detailsResult.content[0] as { text: string }).text);
    expect(parsedDetails).toEqual({
      occurrence: sampleOccurrence,
      evidences: [sampleEvidence],
      diagnosis: null,
    });
  });

  it('returns isError when get_occurrence_details receives 404 on the occurrence itself', async () => {
    const rig = await createConnectedTestRig(async () =>
      jsonResponse({ error: 'Ocorrência não encontrada.' }, 404),
    );
    cleanupCallbacks.push(rig.close);

    const result = await rig.client.callTool({
      name: 'get_occurrence_details',
      arguments: { occurrenceId: 'missing-id' },
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('404');
  });

  it('creates occurrence and adds filtered textual evidence (CA-03)', async () => {
    const capturedRequests: Array<{ url: string; method?: string; body?: unknown }> = [];

    const rig = await createConnectedTestRig(async (input, init) => {
      const url = String(input);
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      capturedRequests.push({ url, method: init?.method, body: parsedBody });

      if (url === `${TEST_API_URL}/occurrences` && init?.method === 'POST') {
        return jsonResponse(
          {
            id: 'occ-new',
            apiName: 'PagSeguro',
            method: 'POST',
            url: 'https://api.pagseguro.com/orders',
            title: 'Ocorrência sem descrição',
            createdAt: '2026-11-16T10:10:00.000Z',
          },
          201,
        );
      }

      if (url === `${TEST_API_URL}/occurrences/occ-new/evidences` && init?.method === 'POST') {
        return jsonResponse(
          {
            id: 'ev-new',
            occurrenceId: 'occ-new',
            ...((parsedBody as Record<string, unknown>) ?? {}),
            createdAt: '2026-11-16T10:11:00.000Z',
            updatedAt: '2026-11-16T10:11:00.000Z',
          },
          201,
        );
      }

      return jsonResponse({ error: 'Not found' }, 404);
    });
    cleanupCallbacks.push(rig.close);

    const createRes = await rig.client.callTool({
      name: 'create_occurrence',
      arguments: {
        apiName: 'PagSeguro',
        method: 'POST',
        url: 'https://api.pagseguro.com/orders',
        description: 'Erro 502 intermitente no checkout',
      },
    });
    expect(createRes.isError).toBeFalsy();
    const createdOcc = JSON.parse((createRes.content[0] as { text: string }).text);
    expect(createdOcc.id).toBe('occ-new');

    const responseEvRes = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-new',
        type: 'HTTP_RESPONSE',
        statusCode: 502,
        body: 'Bad Gateway',
        method: 'POST', // campo irrelevante para HTTP_RESPONSE, não deve ser encaminhado
      },
    });
    expect(responseEvRes.isError).toBeFalsy();

    const requestEvRes = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-new',
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.pagseguro.com/orders',
        headers: { 'Content-Type': 'application/json' },
        payload: '{"amount":1000}',
      },
    });
    expect(requestEvRes.isError).toBeFalsy();

    const logEvRes = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-new',
        type: 'ERROR_LOG',
        content: 'Upstream timeout after 30000ms',
        context: 'checkoutService.ts:48',
      },
    });
    expect(logEvRes.isError).toBeFalsy();

    const noteEvRes = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-new',
        type: 'MANUAL_NOTE',
        content: 'Ocorre apenas em produção.',
      },
    });
    expect(noteEvRes.isError).toBeFalsy();

    expect(capturedRequests[1]?.body).toEqual({
      type: 'HTTP_RESPONSE',
      statusCode: 502,
      body: 'Bad Gateway',
    });
    expect(capturedRequests[2]?.body).toEqual({
      type: 'HTTP_REQUEST',
      method: 'POST',
      url: 'https://api.pagseguro.com/orders',
      headers: { 'Content-Type': 'application/json' },
      payload: '{"amount":1000}',
    });
    expect(capturedRequests[3]?.body).toEqual({
      type: 'ERROR_LOG',
      content: 'Upstream timeout after 30000ms',
      context: 'checkoutService.ts:48',
    });
    expect(capturedRequests[4]?.body).toEqual({
      type: 'MANUAL_NOTE',
      content: 'Ocorre apenas em produção.',
    });
  });

  it('validates contextual required fields in add_evidence before making HTTP calls (RF-04)', async () => {
    const rig = await createConnectedTestRig(async () => jsonResponse({}, 200));
    cleanupCallbacks.push(rig.close);

    const missingReqFields = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-1',
        type: 'HTTP_REQUEST',
      },
    });
    expect(missingReqFields.isError).toBe(true);
    expect((missingReqFields.content[0] as { text: string }).text).toContain('method');

    const invalidReqProtocol = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-1',
        type: 'HTTP_REQUEST',
        method: 'GET',
        url: 'ftp://internal.local/file',
      },
    });
    expect(invalidReqProtocol.isError).toBe(true);
    expect((invalidReqProtocol.content[0] as { text: string }).text).toContain('http:// ou https://');

    const missingRespStatus = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-1',
        type: 'HTTP_RESPONSE',
        body: 'error',
      },
    });
    expect(missingRespStatus.isError).toBe(true);
    expect((missingRespStatus.content[0] as { text: string }).text).toContain('statusCode');

    const missingLogContent = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-1',
        type: 'ERROR_LOG',
        content: '   ',
      },
    });
    expect(missingLogContent.isError).toBe(true);
    expect((missingLogContent.content[0] as { text: string }).text).toContain('content');

    expect(rig.fetchMock).not.toHaveBeenCalled();
  });

  it('forwards Secret Guardrail HTTP 422 details without leaking token (CA-04)', async () => {
    const rig = await createConnectedTestRig(async () =>
      jsonResponse(
        {
          error: 'Remova ou mascare segredos/tokens/API-Keys antes do envio',
          guidance: '1. Remova ou mascare o segredo no conteúdo que deseja registrar.',
          fields: ['headers.Authorization', 'payload'],
        },
        422,
      ),
    );
    cleanupCallbacks.push(rig.close);

    const res = await rig.client.callTool({
      name: 'add_evidence',
      arguments: {
        occurrenceId: 'occ-1',
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.example.com/pay',
        headers: { Authorization: 'Bearer [EXAMPLE_TOKEN]' },
        payload: '{"secret":"value"}',
      },
    });

    expect(res.isError).toBe(true);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('Secret Guardrail');
    expect(text).toContain('headers.Authorization, payload');
    expect(text).toContain('Remova ou mascare');
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain(TEST_TOKEN);
  });

  it('generates diagnosis and handles 409 concurrency conflict, 400 secret double-check and 502/504 (CA-05 / RF-07)', async () => {
    let scenario: 'ok' | '409' | '400-secret' | '504' = 'ok';

    const diagnosisPayload = {
      id: 'diag-1',
      occurrenceId: 'occ-1',
      context: { occurrence: { id: 'occ-1' }, evidences: [] },
      result: {
        facts_observed: ['Status HTTP 502 recebido do gateway'],
        hypotheses: [{ cause: 'Timeout upstream', evidence_support: 'ev-1' }],
        missing_information: ['Headers de correlação x-request-id'],
      },
      isOutdated: false,
      createdAt: '2026-11-16T10:15:00.000Z',
      updatedAt: '2026-11-16T10:15:00.000Z',
    };

    const rig = await createConnectedTestRig(async () => {
      if (scenario === 'ok') {
        return jsonResponse(diagnosisPayload);
      }
      if (scenario === '409') {
        return jsonResponse(
          {
            discardedByConcurrency: true,
            message:
              'Os dados da ocorrência ou de suas evidências foram alterados durante o processamento.',
          },
          409,
        );
      }
      if (scenario === '400-secret') {
        return jsonResponse(
          {
            error: 'Segredo detectado no contexto antes do envio à IA',
            guidance: 'Mascare os campos sinalizados.',
            fields: ['evidences[0].body'],
          },
          400,
        );
      }
      return jsonResponse({ error: 'Timeout ao aguardar provedor de IA.' }, 504);
    });
    cleanupCallbacks.push(rig.close);

    const okRes = await rig.client.callTool({
      name: 'generate_diagnosis',
      arguments: { occurrenceId: 'occ-1' },
    });
    expect(okRes.isError).toBeFalsy();
    expect(JSON.parse((okRes.content[0] as { text: string }).text)).toEqual(diagnosisPayload);

    scenario = '409';
    const conflictRes = await rig.client.callTool({
      name: 'generate_diagnosis',
      arguments: { occurrenceId: 'occ-1' },
    });
    expect(conflictRes.isError).toBe(true);
    expect((conflictRes.content[0] as { text: string }).text).toContain('HTTP 409');
    expect((conflictRes.content[0] as { text: string }).text).toContain('alterados');

    scenario = '400-secret';
    const secretRes = await rig.client.callTool({
      name: 'generate_diagnosis',
      arguments: { occurrenceId: 'occ-1' },
    });
    expect(secretRes.isError).toBe(true);
    expect((secretRes.content[0] as { text: string }).text).toContain('evidences[0].body');

    scenario = '504';
    const timeoutRes = await rig.client.callTool({
      name: 'generate_diagnosis',
      arguments: { occurrenceId: 'occ-1' },
    });
    expect(timeoutRes.isError).toBe(true);
    expect((timeoutRes.content[0] as { text: string }).text).toContain('HTTP 504');
  });

  it('handles HTTP 401 and network errors safely without leaking token (RF-07 / RNF-03)', async () => {
    let mode: '401' | 'network' = '401';
    const rig = await createConnectedTestRig(async () => {
      if (mode === '401') {
        return jsonResponse({ error: 'Token de autenticação inválido ou expirado.' }, 401);
      }
      throw new Error('connect ECONNREFUSED 127.0.0.1:3333');
    });
    cleanupCallbacks.push(rig.close);

    const authErrorRes = await rig.client.callTool({
      name: 'list_occurrences',
      arguments: {},
    });
    expect(authErrorRes.isError).toBe(true);
    const authText = (authErrorRes.content[0] as { text: string }).text;
    expect(authText).toContain('HTTP 401');
    expect(authText).toContain('WHOSEFAULT_API_TOKEN');
    expect(authText).not.toContain(TEST_TOKEN);

    mode = 'network';
    const networkErrorRes = await rig.client.callTool({
      name: 'list_occurrences',
      arguments: {},
    });
    expect(networkErrorRes.isError).toBe(true);
    const networkText = (networkErrorRes.content[0] as { text: string }).text;
    expect(networkText).toContain('ECONNREFUSED');
    expect(networkText).not.toContain(TEST_TOKEN);
  });

  it('returns multimodal image content in get_evidence_image and errors for non-image (CA-08)', async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const expectedBase64 = Buffer.from(pngBytes).toString('base64');

    const rig = await createConnectedTestRig(async (input) => {
      const url = String(input);
      if (url.endsWith('/evidences/ev-img/image')) {
        return new Response(pngBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      if (url.endsWith('/evidences/ev-text/image')) {
        return jsonResponse(
          { error: 'A evidência informada não é do tipo IMAGE.' },
          400,
        );
      }
      return jsonResponse({ error: 'Falha no storage.' }, 502);
    });
    cleanupCallbacks.push(rig.close);

    const imgRes = await rig.client.callTool({
      name: 'get_evidence_image',
      arguments: { occurrenceId: 'occ-1', evidenceId: 'ev-img' },
    });
    expect(imgRes.isError).toBeFalsy();
    expect(imgRes.content[0]).toEqual({
      type: 'image',
      data: expectedBase64,
      mimeType: 'image/png',
    });

    const nonImgRes = await rig.client.callTool({
      name: 'get_evidence_image',
      arguments: { occurrenceId: 'occ-1', evidenceId: 'ev-text' },
    });
    expect(nonImgRes.isError).toBe(true);
    expect((nonImgRes.content[0] as { text: string }).text).toContain('IMAGE');

    const storageErrRes = await rig.client.callTool({
      name: 'get_evidence_image',
      arguments: { occurrenceId: 'occ-1', evidenceId: 'ev-broken' },
    });
    expect(storageErrRes.isError).toBe(true);
    expect((storageErrRes.content[0] as { text: string }).text).toContain('HTTP 502');
  });

  it('reads static and template JSON resources and propagates errors on missing occurrence (CA-06)', async () => {
    const sampleOccurrence = {
      id: 'occ-99',
      apiName: 'GitHub',
      method: 'GET',
      url: 'https://api.github.com/user',
      title: 'Rate limit 403',
      createdAt: '2026-11-16T10:20:00.000Z',
    };

    const rig = await createConnectedTestRig(async (input) => {
      const url = String(input);
      if (url === `${TEST_API_URL}/occurrences`) {
        return jsonResponse({ occurrences: [sampleOccurrence] });
      }
      if (url === `${TEST_API_URL}/occurrences/occ-99`) {
        return jsonResponse(sampleOccurrence);
      }
      if (url === `${TEST_API_URL}/occurrences/occ-99/evidences`) {
        return jsonResponse({ evidences: [] });
      }
      if (url === `${TEST_API_URL}/occurrences/occ-99/diagnosis`) {
        return jsonResponse({ error: 'Diagnóstico não encontrado' }, 404);
      }
      return jsonResponse({ error: 'Ocorrência não encontrada.' }, 404);
    });
    cleanupCallbacks.push(rig.close);

    const listResource = await rig.client.readResource({ uri: 'whosefault://occurrences' });
    expect(listResource.contents[0]).toMatchObject({
      uri: 'whosefault://occurrences',
      mimeType: 'application/json',
    });
    expect(JSON.parse((listResource.contents[0] as { text: string }).text)).toEqual([
      sampleOccurrence,
    ]);

    const detailResource = await rig.client.readResource({
      uri: 'whosefault://occurrences/occ-99',
    });
    expect(detailResource.contents[0]).toMatchObject({
      uri: 'whosefault://occurrences/occ-99',
      mimeType: 'application/json',
    });
    expect(JSON.parse((detailResource.contents[0] as { text: string }).text)).toEqual({
      occurrence: sampleOccurrence,
      evidences: [],
      diagnosis: null,
    });

    await expect(
      rig.client.readResource({ uri: 'whosefault://occurrences/does-not-exist' }),
    ).rejects.toThrow(/404/);
  });

  it('generates investigate_occurrence prompt referencing occurrenceId and WhoseFault tools/resources (CA-07)', async () => {
    const rig = await createConnectedTestRig(async () => jsonResponse({}));
    cleanupCallbacks.push(rig.close);

    const promptRes = await rig.client.getPrompt({
      name: 'investigate_occurrence',
      arguments: { occurrenceId: 'occ-abc-123' },
    });

    expect(promptRes.messages).toHaveLength(1);
    expect(promptRes.messages[0]?.role).toBe('user');
    const content = promptRes.messages[0]?.content as { type: string; text: string };
    expect(content.type).toBe('text');
    expect(content.text).toContain('occ-abc-123');
    expect(content.text).toContain('get_occurrence_details');
    expect(content.text).toContain('whosefault://occurrences/occ-abc-123');
    expect(content.text).toContain('generate_diagnosis');
  });

  it('connects over real stdio transport without corrupting stdout (CA-09 / RNF-02)', async () => {
    const distEntry = path.join(PACKAGE_ROOT, 'dist', 'index.js');
    const srcEntry = path.join(PACKAGE_ROOT, 'src', 'index.ts');
    const args = existsSync(distEntry) ? [distEntry] : ['--import', 'tsx', srcEntry];

    const transport = new StdioClientTransport({
      command: process.execPath,
      args,
      cwd: PACKAGE_ROOT,
      stderr: 'pipe',
      env: {
        ...process.env,
        WHOSEFAULT_API_TOKEN: 'stdio-smoke-token',
      } as Record<string, string>,
    });

    const stderrChunks: string[] = [];
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(String(chunk));
    });

    const client = new Client({ name: 'stdio-smoke-client', version: '1.0.0' });
    cleanupCallbacks.push(async () => {
      await client.close();
    });

    await client.connect(transport);

    const [toolsRes, resourcesRes, templatesRes, promptsRes] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listResourceTemplates(),
      client.listPrompts(),
    ]);

    expect(toolsRes.tools).toHaveLength(6);
    expect(resourcesRes.resources).toHaveLength(1);
    expect(templatesRes.resourceTemplates).toHaveLength(1);
    expect(promptsRes.prompts).toHaveLength(1);
    expect(stderrChunks.join('')).toContain('Servidor MCP conectado via stdio');
  });
});
