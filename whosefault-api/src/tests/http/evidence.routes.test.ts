import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../../http/server.js';
import { occurrenceRepository } from '../../infra/repositories/occurrenceRepository.js';
import { evidenceRepository } from '../../infra/repositories/evidenceRepository.js';
import { Occurrence } from '../../domain/occurrence.js';
import { SECRET_ALERT_MESSAGE } from '../../domain/services/ISecretDetector.js';

describe('SPEC-03: Endpoints HTTP de Evidências (/api/occurrences/:occurrenceId/evidences)', () => {
  let occurrenceId: string;

  beforeEach(async () => {
    occurrenceRepository.clear();
    evidenceRepository.clear();

    const occ = Occurrence.create({
      apiName: 'Gateway Pagamentos',
      url: 'https://api.pagamentos.com/v1/charge',
      method: 'POST',
    });
    await occurrenceRepository.save(occ);
    occurrenceId = occ.id;
  });

  it('CA-01, CA-03, CA-05 e CA-06: deve criar evidências dos 4 tipos via POST e retornar HTTP 201', async () => {
    // Arrange
    const app = createServer();

    // Act
    const resReq = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.pagamentos.com/v1/charge',
        headers: { 'Content-Type': 'application/json' },
        payload: '{"valor":100}',
      },
    });

    const resResp = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'HTTP_RESPONSE',
        statusCode: 503,
        body: 'Service Unavailable',
      },
    });

    const resLog = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'ERROR_LOG',
        content: 'Upstream connect error or disconnect/reset before headers',
      },
    });

    const resNote = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'MANUAL_NOTE',
        content: 'Servidor respondeu 503 após atualização de certificado.',
      },
    });

    // Assert
    expect(resReq.statusCode).toBe(201);
    expect(resResp.statusCode).toBe(201);
    expect(resLog.statusCode).toBe(201);
    expect(resNote.statusCode).toBe(201);
  });

  it('CA-02 e CA-04: deve rejeitar com HTTP 400 requisições ou respostas inválidas', async () => {
    // Arrange
    const app = createServer();

    // Act
    const invalidReq = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'HTTP_REQUEST',
        method: 'GET',
        url: 'url-invalida',
      },
    });

    const invalidResp = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'HTTP_RESPONSE',
        statusCode: 999,
      },
    });

    // Assert
    expect(invalidReq.statusCode).toBe(400);
    expect(invalidResp.statusCode).toBe(400);
  });

  it('CA-08: deve listar as evidências no endpoint dedicado sem sobrecarregar o GET /api/occurrences/:id', async () => {
    // Arrange
    const app = createServer();
    await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'MANUAL_NOTE',
        content: 'Primeira observação',
      },
    });

    // Act
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/evidences`,
    });
    const occRes = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}`,
    });

    // Assert
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.evidences).toHaveLength(1);
    expect(listBody.evidences[0].content).toBe('Primeira observação');

    expect(occRes.statusCode).toBe(200);
    const occBody = occRes.json();
    expect(occBody.evidences).toBeUndefined();
  });

  it('CA-09: deve editar parcialmente uma evidência via PATCH e retornar HTTP 200', async () => {
    // Arrange
    const app = createServer();
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'HTTP_RESPONSE',
        statusCode: 500,
        body: 'Erro original',
        notes: 'Nota preservada',
      },
    });
    const created = createRes.json();

    // Act
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/occurrences/${occurrenceId}/evidences/${created.id}`,
      payload: {
        body: 'Erro atualizado',
      },
    });

    // Assert
    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json();
    expect(updated.body).toBe('Erro atualizado');
    expect(updated.statusCode).toBe(500);
    expect(updated.notes).toBe('Nota preservada');
  });

  it('CA-10, CA-11 e CA-12: deve exigir ?confirm=true no DELETE e excluir definitivamente apenas quando confirmado', async () => {
    // Arrange
    const app = createServer();
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'MANUAL_NOTE',
        content: 'Nota para teste de exclusão',
      },
    });
    const created = createRes.json();

    // Act (sem confirmação)
    const deleteWithoutConfirm = await app.inject({
      method: 'DELETE',
      url: `/api/occurrences/${occurrenceId}/evidences/${created.id}`,
    });

    // Assert (evidência preservada)
    expect(deleteWithoutConfirm.statusCode).toBe(400);
    expect(deleteWithoutConfirm.json().confirmationRequired).toBe(true);

    // Act (com ?confirm=true)
    const deleteConfirmed = await app.inject({
      method: 'DELETE',
      url: `/api/occurrences/${occurrenceId}/evidences/${created.id}?confirm=true`,
    });

    // Assert (evidência excluída)
    expect(deleteConfirmed.statusCode).toBe(200);
    const listAfter = await app.inject({
      method: 'GET',
      url: `/api/occurrences/${occurrenceId}/evidences`,
    });
    expect(listAfter.json().evidences).toHaveLength(0);
  });

  it('CA-13 e CA-14: deve rejeitar com HTTP 422 o envio de segredos na criação ou edição e retornar o alerta e a orientação de segurança sem vazar o segredo', async () => {
    // Arrange
    const app = createServer();
    const rawSecret = 'sk-live-secret999888777666555444';

    // Act
    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      payload: {
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.pagamentos.com/v1/charge',
        headers: {
          Authorization: `Bearer ${rawSecret}`,
        },
      },
    });

    // Assert
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe(SECRET_ALERT_MESSAGE);
    expect(body.guidance).toContain('Revogue ou rotacione a credencial');
    expect(body.fields).toContain('headers');
    expect(JSON.stringify(body)).not.toContain(rawSecret);
  });

  it('CA-17: deve rejeitar upload de arquivos (multipart/form-data) com HTTP 400 na V1', async () => {
    // Arrange
    const app = createServer();

    // Act
    const res = await app.inject({
      method: 'POST',
      url: `/api/occurrences/${occurrenceId}/evidences`,
      headers: {
        'content-type': 'multipart/form-data; boundary=---boundary',
      },
      payload: '-----boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\nconteudo\r\n-----boundary--',
    });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Upload de arquivos não é permitido na V1');
  });
});
