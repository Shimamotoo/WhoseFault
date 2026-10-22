import { describe, it, expect } from 'vitest';
import { PatternSecretDetector } from '../../domain/services/secretDetector.js';
import {
  SECRET_ALERT_MESSAGE,
  SensitiveDataDetectedError,
  type SecretInspectionInput,
} from '../../domain/services/ISecretDetector.js';

describe('SPEC-03: Detector de Dados Sensíveis (PatternSecretDetector)', () => {
  const detector = new PatternSecretDetector();

  it('CA-13: deve detectar tokens Bearer, Basic, JWT, API Keys, Cookies, chaves privadas PEM, senhas e credenciais em URLs', () => {
    // Arrange
    const cases: Array<{ field: string; input: SecretInspectionInput }> = [
      {
        field: 'headers',
        input: { headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' } },
      },
      {
        field: 'headers',
        input: { headers: { Cookie: 'connect.sid=s%3A9876543210abcdef.xyz123' } },
      },
      {
        field: 'url',
        input: { url: 'https://admin:SuperSecret123@api.exemplo.com/v1/resource' },
      },
      {
        field: 'url',
        input: { url: 'https://api.exemplo.com/v1/items?api_key=sk-live-9876543210abcdef123456' },
      },
      {
        field: 'payload',
        input: { payload: '{"username":"dev","password":"MyPlainTextPassword!2026"}' },
      },
      {
        field: 'content',
        input: {
          content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
        },
      },
      {
        field: 'content',
        input: {
          content: 'Database error connecting to postgres://dbuser:dbpass123@localhost:5432/prod',
        },
      },
    ];

    // Act & Assert
    for (const testCase of cases) {
      const result = detector.inspect(testCase.input);
      expect(result.hasSecrets).toBe(true);
      expect(result.detectedFields).toContain(testCase.field);
      expect(result.alertMessage).toBe(SECRET_ALERT_MESSAGE);
      expect(() => detector.assertNoSecrets(testCase.input)).toThrow(SensitiveDataDetectedError);
    }
  });

  it('CA-13: deve permitir o registro quando os segredos estiverem devidamente mascarados pelo desenvolvedor', () => {
    // Arrange
    const maskedInput = {
      url: 'https://api.exemplo.com/v1/items?api_key=[REDACTED]',
      headers: {
        Authorization: 'Bearer ***',
        'X-API-Key': '[MASKED]',
        'Content-Type': 'application/json',
      },
      payload: '{"password":"***","cliente":"Empresa X"}',
      notes: 'Token mascarado antes do envio.',
    };

    // Act
    const result = detector.inspect(maskedInput);

    // Assert
    expect(result.hasSecrets).toBe(false);
    expect(result.detectedFields).toEqual([]);
    expect(() => detector.assertNoSecrets(maskedInput)).not.toThrow();
  });

  it('CA-14: deve fornecer orientação de segurança recomendando revogação ou rotação e esclarecendo que excluir no WhoseFault não invalida a credencial', () => {
    // Arrange
    const inputWithSecret = {
      payload: 'api_key=sk-live-abcdef1234567890abcdef12',
    };

    // Act
    const result = detector.inspect(inputWithSecret);

    // Assert
    expect(result.hasSecrets).toBe(true);
    expect(result.alertMessage).toBe(
      'Remova ou mascare segredos/tokens/API-Keys antes do envio',
    );
    expect(result.securityGuidance).toContain('Revogue ou rotacione a credencial');
    expect(result.securityGuidance).toContain(
      'apagar ou editar a evidência no WhoseFault não invalida uma credencial que já tenha sido exposta',
    );
  });
});
