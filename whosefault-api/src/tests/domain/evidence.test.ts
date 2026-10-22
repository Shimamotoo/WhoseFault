import { describe, it, expect } from 'vitest';
import {
  Evidence,
  EVIDENCE_LIMITS,
  EVIDENCE_TYPES,
  type EvidenceType,
} from '../../domain/evidence.js';
import type { HttpMethod } from '../../domain/occurrence.js';
import {
  SECRET_ALERT_MESSAGE,
  SensitiveDataDetectedError,
} from '../../domain/services/ISecretDetector.js';

describe('SPEC-03: Entidade Evidence (Domínio)', () => {
  const occurrenceId = 'occ-123';

  it('CA-01: deve permitir o registro de requisição HTTP com método e URL válidos mesmo sem campos opcionais', () => {
    // Arrange
    const props = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'POST' as HttpMethod,
      url: 'https://api.exemplo.com/v1/pagamentos',
    };

    // Act
    const evidence = Evidence.create(props);

    // Assert
    expect(evidence.id).toBeDefined();
    expect(evidence.occurrenceId).toBe(occurrenceId);
    expect(evidence.type).toBe('HTTP_REQUEST');
    expect(evidence.method).toBe('POST');
    expect(evidence.url).toBe('https://api.exemplo.com/v1/pagamentos');
    expect(evidence.headers).toBeUndefined();
    expect(evidence.payload).toBeUndefined();
    expect(evidence.notes).toBeUndefined();
  });

  it('CA-01: deve permitir o registro de requisição HTTP com cabeçalhos, payload e observações opcionais', () => {
    // Arrange
    const props = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'PUT' as HttpMethod,
      url: 'https://api.exemplo.com/v1/clientes/42',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      payload: '{"nome":"Maria"}',
      notes: 'Enviado durante o teste de homologação.',
    };

    // Act
    const evidence = Evidence.create(props);

    // Assert
    expect(evidence.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(evidence.payload).toBe('{"nome":"Maria"}');
    expect(evidence.notes).toBe('Enviado durante o teste de homologação.');
  });

  it('CA-02: deve rejeitar requisição HTTP quando o método HTTP ou a URL forem inválidos ou ausentes', () => {
    // Arrange
    const missingMethod = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      url: 'https://api.exemplo.com/v1/pagamentos',
    };
    const invalidMethod = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'CONNECT' as unknown as HttpMethod,
      url: 'https://api.exemplo.com/v1/pagamentos',
    };
    const relativeUrl = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'GET' as HttpMethod,
      url: '/v1/pagamentos',
    };
    const invalidProtocolUrl = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'GET' as HttpMethod,
      url: 'ftp://api.exemplo.com/v1/pagamentos',
    };

    // Act & Assert
    expect(() => Evidence.create(missingMethod)).toThrow(
      'Método HTTP é obrigatório para evidência de requisição HTTP.',
    );
    expect(() => Evidence.create(invalidMethod)).toThrow('Método HTTP inválido: CONNECT.');
    expect(() => Evidence.create(relativeUrl)).toThrow('URL inválida.');
    expect(() => Evidence.create(invalidProtocolUrl)).toThrow(
      'URL deve utilizar o protocolo HTTP ou HTTPS.',
    );
  });

  it('CA-03: deve permitir o registro de resposta HTTP apenas com status HTTP válido (100 a 599)', () => {
    // Arrange
    const propsMin = {
      occurrenceId,
      type: 'HTTP_RESPONSE' as EvidenceType,
      statusCode: 100,
    };
    const propsMax = {
      occurrenceId,
      type: 'HTTP_RESPONSE' as EvidenceType,
      statusCode: 599,
      headers: { 'X-Request-Id': 'req-001' },
      body: '{"error":"Gateway Timeout"}',
      notes: 'Demorou 30 segundos.',
    };

    // Act
    const evMin = Evidence.create(propsMin);
    const evMax = Evidence.create(propsMax);

    // Assert
    expect(evMin.statusCode).toBe(100);
    expect(evMin.headers).toBeUndefined();
    expect(evMax.statusCode).toBe(599);
    expect(evMax.body).toBe('{"error":"Gateway Timeout"}');
  });

  it('CA-04: deve rejeitar resposta HTTP quando o status HTTP estiver fora do intervalo inteiro de 100 a 599', () => {
    // Arrange
    const belowRange = {
      occurrenceId,
      type: 'HTTP_RESPONSE' as EvidenceType,
      statusCode: 99,
    };
    const aboveRange = {
      occurrenceId,
      type: 'HTTP_RESPONSE' as EvidenceType,
      statusCode: 600,
    };
    const floatStatus = {
      occurrenceId,
      type: 'HTTP_RESPONSE' as EvidenceType,
      statusCode: 200.5,
    };

    // Act & Assert
    expect(() => Evidence.create(belowRange)).toThrow(
      'Status HTTP inválido: deve ser um número inteiro entre 100 e 599.',
    );
    expect(() => Evidence.create(aboveRange)).toThrow(
      'Status HTTP inválido: deve ser um número inteiro entre 100 e 599.',
    );
    expect(() => Evidence.create(floatStatus)).toThrow(
      'Status HTTP inválido: deve ser um número inteiro entre 100 e 599.',
    );
  });

  it('CA-05: deve permitir o registro de log ou mensagem de erro com conteúdo textual obrigatório e contexto opcional', () => {
    // Arrange
    const validLog = {
      occurrenceId,
      type: 'ERROR_LOG' as EvidenceType,
      content: 'Error: ECONNRESET at TLSWrap.onStreamRead',
      context: 'Container de produção às 14:02 UTC',
    };
    const emptyLog = {
      occurrenceId,
      type: 'ERROR_LOG' as EvidenceType,
      content: '   ',
    };

    // Act
    const evidence = Evidence.create(validLog);

    // Assert
    expect(evidence.type).toBe('ERROR_LOG');
    expect(evidence.content).toBe('Error: ECONNRESET at TLSWrap.onStreamRead');
    expect(evidence.context).toBe('Container de produção às 14:02 UTC');
    expect(() => Evidence.create(emptyLog)).toThrow(
      'Conteúdo textual é obrigatório para evidência de log ou mensagem de erro.',
    );
  });

  it('CA-06: deve permitir o registro de observação manual com conteúdo textual obrigatório', () => {
    // Arrange
    const validNote = {
      occurrenceId,
      type: 'MANUAL_NOTE' as EvidenceType,
      content: 'O erro só ocorre quando o payload inclui caracteres acentuados.',
    };
    const emptyNote = {
      occurrenceId,
      type: 'MANUAL_NOTE' as EvidenceType,
      content: '',
    };

    // Act
    const evidence = Evidence.create(validNote);

    // Assert
    expect(evidence.type).toBe('MANUAL_NOTE');
    expect(evidence.content).toBe(
      'O erro só ocorre quando o payload inclui caracteres acentuados.',
    );
    expect(() => Evidence.create(emptyNote)).toThrow(
      'Conteúdo textual é obrigatório para evidência de observação manual.',
    );
  });

  it('CA-13: deve impedir a criação da entidade quando detectar segredo desprotegido', () => {
    // Arrange
    const propsWithSecret = {
      occurrenceId,
      type: 'HTTP_REQUEST' as EvidenceType,
      method: 'GET' as HttpMethod,
      url: 'https://api.exemplo.com/v1/dados',
      headers: {
        Authorization: 'Bearer sk-live-1234567890abcdef12345678',
      },
    };

    // Act & Assert
    expect(() => Evidence.create(propsWithSecret)).toThrow(SensitiveDataDetectedError);
    expect(() => Evidence.create(propsWithSecret)).toThrow(SECRET_ALERT_MESSAGE);
  });

  it('RN-03: deve aceitar apenas os quatro tipos de evidência permitidos na V1', () => {
    // Arrange
    const invalidTypeProps = {
      occurrenceId,
      type: 'FILE_ATTACHMENT' as unknown as EvidenceType,
      content: 'arquivo.pdf',
    };

    // Act & Assert
    expect(EVIDENCE_TYPES).toEqual([
      'HTTP_REQUEST',
      'HTTP_RESPONSE',
      'ERROR_LOG',
      'MANUAL_NOTE',
    ]);
    expect(() => Evidence.create(invalidTypeProps)).toThrow(
      'Tipo de evidência inválido: FILE_ATTACHMENT.',
    );
  });

  it('RN-04: deve validar os limites máximos de caracteres definidos para URL, observações, payloads e logs', () => {
    // Arrange
    const longUrl = 'https://api.exemplo.com/' + 'a'.repeat(EVIDENCE_LIMITS.MAX_URL_LENGTH);
    const longNote = 'x'.repeat(EVIDENCE_LIMITS.MAX_NOTE_LENGTH + 1);
    const longPayload = 'p'.repeat(EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH + 1);

    // Act & Assert
    expect(() =>
      Evidence.create({
        occurrenceId,
        type: 'HTTP_REQUEST',
        method: 'GET',
        url: longUrl,
      }),
    ).toThrow(`URL excede o limite máximo de ${EVIDENCE_LIMITS.MAX_URL_LENGTH} caracteres.`);

    expect(() =>
      Evidence.create({
        occurrenceId,
        type: 'MANUAL_NOTE',
        content: longNote,
      }),
    ).toThrow(
      `Observação manual excede o limite máximo de ${EVIDENCE_LIMITS.MAX_NOTE_LENGTH} caracteres.`,
    );

    expect(() =>
      Evidence.create({
        occurrenceId,
        type: 'HTTP_REQUEST',
        method: 'POST',
        url: 'https://api.exemplo.com/v1/items',
        payload: longPayload,
      }),
    ).toThrow(
      `Payload excede o limite máximo de ${EVIDENCE_LIMITS.MAX_PAYLOAD_LOG_LENGTH} caracteres.`,
    );
  });
});
