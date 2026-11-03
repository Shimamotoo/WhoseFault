import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../../src/http/server.js';
import { InMemoryOccurrenceRepository } from '../../src/infra/repositories/occurrenceRepository.js';
import { InMemoryEvidenceRepository } from '../../src/infra/repositories/evidenceRepository.js';
import { InMemoryDiagnosisRepository } from '../../src/infra/repositories/diagnosisRepository.js';
import { InMemoryUserRepository } from '../../src/infra/repositories/userRepository.js';
import { StubStorageService } from '../../src/infra/storage/stubStorageService.js';
import { StubDiagnosisGenerator } from '../../src/infra/ai/stubDiagnosisGenerator.js';
import { StubTokenVerifier } from '../../src/infra/auth/stubTokenVerifier.js';

function buildMultipartPayload(params: {
  boundary: string;
  file?: {
    filename: string;
    contentType: string;
    buffer: Buffer;
  };
  notes?: string;
}): Buffer {
  const chunks: Buffer[] = [];
  const { boundary, file, notes } = params;

  if (notes !== undefined) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\n${notes}\r\n`,
        'utf-8',
      ),
    );
  }

  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
        'utf-8',
      ),
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n', 'utf-8'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  return Buffer.concat(chunks);
}

describe('SPEC-08 — Evidências em Foto (GCP Storage + Base64 Multimodal)', () => {
  let occurrenceRepo: InMemoryOccurrenceRepository;
  let evidenceRepo: InMemoryEvidenceRepository;
  let diagnosisRepo: InMemoryDiagnosisRepository;
  let userRepo: InMemoryUserRepository;
  let storageService: StubStorageService;
  let diagnosisGenerator: StubDiagnosisGenerator;
  let app: ReturnType<typeof createServer>;
  let occurrenceId: string;

  const samplePngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  beforeEach(async () => {
    occurrenceRepo = new InMemoryOccurrenceRepository();
    evidenceRepo = new InMemoryEvidenceRepository();
    diagnosisRepo = new InMemoryDiagnosisRepository();
    userRepo = new InMemoryUserRepository();
    storageService = new StubStorageService();
    diagnosisGenerator = new StubDiagnosisGenerator();

    app = createServer({
      occurrenceRepository: occurrenceRepo,
      evidenceRepository: evidenceRepo,
      diagnosisRepository: diagnosisRepo,
      userRepository: userRepo,
      storageService,
      diagnosisGenerator,
      tokenVerifier: new StubTokenVerifier({ uid: 'user-owner-uid' }),
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/occurrences',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        apiName: 'Gateway Pagamentos',
        url: 'https://api.pagamentos.com/v1/checkout',
        method: 'POST',
        description: 'Erro 502 ao finalizar transação PIX',
      },
    });

    occurrenceId = createRes.json().id;
  });

  it('CA-01: deve realizar upload de imagem PNG válida com notas via multipart/form-data e salvar no storage', async () => {
    const boundary = '----Spec08BoundaryCA01';
    const payload = buildMultipartPayload({
      boundary,
      notes: 'Print da aba Network no Chrome DevTools exibindo 502 Bad Gateway',
      file: {
        filename: 'devtools-502.png',
        contentType: 'image/png',
        buffer: samplePngBuffer,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.type).toBe('IMAGE');
    expect(body.occurrenceId).toBe(occurrenceId);
    expect(body.url).toMatch(new RegExp(`^occurrences/${occurrenceId}/.+\\.png$`));
    expect(body.notes).toBe('Print da aba Network no Chrome DevTools exibindo 502 Bad Gateway');
    expect(body.headers?.contentType).toBe('image/png');
    expect(storageService.hasFile(body.url)).toBe(true);
  });

  it('CA-02: deve rejeitar formato de arquivo inválido (PDF) com HTTP 400 sem salvar no storage', async () => {
    const boundary = '----Spec08BoundaryCA02';
    const payload = buildMultipartPayload({
      boundary,
      file: {
        filename: 'relatorio.pdf',
        contentType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 fake pdf'),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/JPEG, PNG e WEBP/i);
    expect(storageService.size).toBe(0);
  });

  it('CA-03: deve rejeitar arquivo acima do limite de 5MB com HTTP 400 sem salvar no storage', async () => {
    const boundary = '----Spec08BoundaryCA03';
    const sixMbBuffer = Buffer.alloc(6 * 1024 * 1024, 0x41);
    const payload = buildMultipartPayload({
      boundary,
      file: {
        filename: 'foto-pesada.png',
        contentType: 'image/png',
        buffer: sixMbBuffer,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('5MB');
    expect(storageService.size).toBe(0);
  });

  it('RF-02: deve limitar a no máximo 5 evidências do tipo IMAGE por ocorrência', async () => {
    const boundary = '----Spec08BoundaryLimit';

    for (let i = 1; i <= 5; i++) {
      const payload = buildMultipartPayload({
        boundary,
        file: {
          filename: `foto-${i}.webp`,
          contentType: 'image/webp',
          buffer: samplePngBuffer,
        },
      });
      const okRes = await app.inject({
        method: 'POST',
        url: `/api/occurrences/${occurrenceId}/evidences`,
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(okRes.statusCode).toBe(201);
    }

    const sixthPayload = buildMultipartPayload({
      boundary,
      file: {
        filename: 'foto-6.webp',
        contentType: 'image/webp',
        buffer: samplePngBuffer,
      },
    });

    const sixthRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: sixthPayload,
    });

    expect(sixthRes.statusCode).toBe(400);
    expect(sixthRes.json().error).toContain('5');
    expect(storageService.size).toBe(5);
  });

  it('CA-04: deve permitir visualização autenticada da imagem com Content-Type e Cache-Control e bloquear acesso não autorizado', async () => {
    const boundary = '----Spec08BoundaryCA04';
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipartPayload({
        boundary,
        file: {
          filename: 'erro-postman.png',
          contentType: 'image/png',
          buffer: samplePngBuffer,
        },
      }),
    });

    const evidenceId = uploadRes.json().id;

    // Acesso autenticado pelo dono -> 200 OK com bytes idênticos
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/evidences/${evidenceId}/image`,
      headers: {
        authorization: 'Bearer valid-token',
      },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers['content-type']).toBe('image/png');
    expect(getRes.headers['cache-control']).toBe('private, max-age=86400');
    expect(Buffer.compare(getRes.rawPayload, samplePngBuffer)).toBe(0);

    // Acesso sem token em ocorrência que possui dono -> 401 Unauthorized
    const unauthRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/evidences/${evidenceId}/image`,
    });
    expect(unauthRes.statusCode).toBe(401);

    // Acesso por outro usuário -> 404 Not Found (isolamento multi-inquilino)
    const appOtherUser = createServer({
      occurrenceRepository: occurrenceRepo,
      evidenceRepository: evidenceRepo,
      diagnosisRepository: diagnosisRepo,
      userRepository: userRepo,
      storageService,
      tokenVerifier: new StubTokenVerifier({ uid: 'intruso-uid' }),
    });

    const intruderRes = await appOtherUser.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/evidences/${evidenceId}/image`,
      headers: { authorization: 'Bearer intruder-token' },
    });
    expect(intruderRes.statusCode).toBe(404);
  });

  it('CA-05 e RNF-03: deve converter a imagem sob demanda em Base64 para a IA sem persistir Base64 no banco', async () => {
    // 1. Adiciona evidência textual
    await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        type: 'HTTP_RESPONSE',
        statusCode: 502,
        body: '{"message":"Bad Gateway"}',
      },
    });

    // 2. Adiciona evidência em imagem
    const boundary = '----Spec08BoundaryCA05';
    const imgRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipartPayload({
        boundary,
        notes: 'Print do console mostrando timeout upstream',
        file: {
          filename: 'console.png',
          contentType: 'image/png',
          buffer: samplePngBuffer,
        },
      }),
    });
    const imageEvidenceId = imgRes.json().id;

    // 3. Solicita diagnóstico
    const diagRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/diagnosis`,
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(diagRes.statusCode).toBe(200);

    // Verifica que o gerador de IA recebeu a imagem convertida para Base64
    expect(diagnosisGenerator.lastReceivedImages).toHaveLength(1);
    expect(diagnosisGenerator.lastReceivedImages[0]).toEqual({
      evidenceId: imageEvidenceId,
      mimeType: 'image/png',
      base64Data: samplePngBuffer.toString('base64'),
      notes: 'Print do console mostrando timeout upstream',
    });

    // Verifica RNF-03: contexto persistido no banco contém apenas metadados/storagePath, NUNCA Base64
    const savedDiagnosis = await diagnosisRepo.findByOccurrenceId(occurrenceId);
    expect(savedDiagnosis).not.toBeNull();
    const serializedSavedContext = JSON.stringify(savedDiagnosis?.context);
    expect(serializedSavedContext).not.toContain(samplePngBuffer.toString('base64'));
    expect(serializedSavedContext).toContain(`occurrences/${occurrenceId}/`);
  });

  it('CA-06: deve excluir o arquivo físico do storage ao remover a evidência de imagem', async () => {
    const boundary = '----Spec08BoundaryCA06';
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipartPayload({
        boundary,
        file: {
          filename: 'print-erro.jpg',
          contentType: 'image/jpeg',
          buffer: samplePngBuffer,
        },
      }),
    });

    const { id: evidenceId, url: storagePath } = uploadRes.json();
    expect(storageService.hasFile(storagePath)).toBe(true);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/occurrences/${occurrenceId}/evidences/${evidenceId}?confirm=true`,
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(delRes.statusCode).toBe(200);
    expect(await evidenceRepo.findById(evidenceId)).toBeNull();
    expect(storageService.hasFile(storagePath)).toBe(false);
  });

  it('CA-07: deve expurgar todos os arquivos de imagem do storage ao excluir a ocorrência inteira', async () => {
    const boundary = '----Spec08BoundaryCA07';
    const paths: string[] = [];

    for (let i = 1; i <= 2; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/occurrences/${occurrenceId}/evidences`,
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: buildMultipartPayload({
          boundary,
          file: {
            filename: `evidencia-${i}.png`,
            contentType: 'image/png',
            buffer: samplePngBuffer,
          },
        }),
      });
      paths.push(res.json().url);
    }

    expect(storageService.size).toBe(2);

    const delOccRes = await app.inject({
      method: 'DELETE',
      url: `/api/occurrences/${occurrenceId}`,
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(delOccRes.statusCode).toBe(204);
    expect(storageService.size).toBe(0);
    for (const p of paths) {
      expect(storageService.hasFile(p)).toBe(false);
    }
  });

  it('CA-08: deve bloquear o upload com HTTP 400 e não salvar no storage quando as notas contiverem segredos expostos', async () => {
    const boundary = '----Spec08BoundaryCA08';
    const rawSecret = 'sk-live-9876543210abcdef1234567890';
    const payload = buildMultipartPayload({
      boundary,
      notes: `Testei usando api_key=${rawSecret} no header`,
      file: {
        filename: 'print.png',
        contentType: 'image/png',
        buffer: samplePngBuffer,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.guidance).toBeDefined();
    expect(body.fields).toContain('notes');
    expect(JSON.stringify(body)).not.toContain(rawSecret);
    expect(storageService.size).toBe(0);
  });
});
