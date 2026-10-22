import {
  SECRET_ALERT_MESSAGE,
  SECRET_SECURITY_GUIDANCE,
  SensitiveDataDetectedError,
  type ISecretDetector,
  type SecretDetectionResult,
  type SecretInspectionInput,
} from './ISecretDetector.js';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'api-key',
  'apikey',
]);

/**
 * Verifica se um valor já foi mascarado pelo desenvolvedor (ex: "***", "[REDACTED]", "<masked>", "Bearer ***").
 */
function isMaskedValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (/^\*+$/.test(trimmed)) return true;
  if (/^\[?(REDACTED|MASKED|OCULTO|MASCARADO|REMOVIDO)\]?$/i.test(trimmed)) return true;
  if (/^<(redacted|masked|secret|token|oculto)>$/i.test(trimmed)) return true;
  if (/^(Bearer|Basic|Token)\s+(\*+|\[?(REDACTED|MASKED|OCULTO)\]?|<[^>]+>)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

const SECRET_PATTERNS: RegExp[] = [
  // Chaves privadas / blocos PEM
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  // JWT (três segmentos Base64URL iniciados por eyJ)
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  // Cabeçalhos ou strings Authorization Bearer/Basic com valor real (não mascarado)
  /\b(?:Bearer|Basic)\s+(?!\*+\b|\[?REDACTED\]?|\[?MASKED\]?|\[?OCULTO\]?)[A-Za-z0-9._~+/=-]{8,}/i,
  // Credenciais embutidas em URLs (ex: https://user:password@host)
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:(?!\*+@|\[REDACTED\]@)[^/\s@]+@[^/\s]+/i,
  // Strings de conexão de banco/serviços com credenciais (postgres://, mongodb://, redis://, amqp://, mysql://)
  /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis|rediss|mysql|amqp|amqps):\/\/[^\s]+/i,
  // Prefixos conhecidos de API Keys (OpenAI, GitHub, Stripe, AWS, Slack, Google, etc.)
  /\b(?:sk-(?:live|test|proj)?-?[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/,
  // Parâmetros de query ou atribuições com nomes de segredos em URLs, JSON, env, logs
  /(?:["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|secret[_-]?key|password|passwd|senha|pwd|session[_-]?id|connect\.sid|phpsessid)["']?\s*(?:=|:)\s*["']?)(?!\*+|\[?(?:REDACTED|MASKED|OCULTO)\]?|<[^>]+>|null|undefined|true|false)([^\s"',;&}]{4,})/i,
];

function containsSecretPattern(text: string): boolean {
  if (!text || isMaskedValue(text)) {
    return false;
  }
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function headersContainSecrets(headers: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.trim().toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(normalizedKey)) {
      if (!isMaskedValue(String(value))) {
        return true;
      }
    }
    if (containsSecretPattern(`${key}: ${value}`) || containsSecretPattern(String(value))) {
      return true;
    }
  }
  return false;
}

export class PatternSecretDetector implements ISecretDetector {
  inspect(input: SecretInspectionInput): SecretDetectionResult {
    const detectedFields: string[] = [];

    if (input.url && containsSecretPattern(input.url)) {
      detectedFields.push('url');
    }

    if (input.headers && headersContainSecrets(input.headers)) {
      detectedFields.push('headers');
    }

    if (input.payload && containsSecretPattern(input.payload)) {
      detectedFields.push('payload');
    }

    if (input.body && containsSecretPattern(input.body)) {
      detectedFields.push('body');
    }

    if (input.content && containsSecretPattern(input.content)) {
      detectedFields.push('content');
    }

    if (input.context && containsSecretPattern(input.context)) {
      detectedFields.push('context');
    }

    if (input.notes && containsSecretPattern(input.notes)) {
      detectedFields.push('notes');
    }

    return {
      hasSecrets: detectedFields.length > 0,
      detectedFields,
      alertMessage: SECRET_ALERT_MESSAGE,
      securityGuidance: SECRET_SECURITY_GUIDANCE,
    };
  }

  assertNoSecrets(input: SecretInspectionInput): void {
    const result = this.inspect(input);
    if (result.hasSecrets) {
      throw new SensitiveDataDetectedError(result.detectedFields);
    }
  }
}

export const defaultSecretDetector = new PatternSecretDetector();
