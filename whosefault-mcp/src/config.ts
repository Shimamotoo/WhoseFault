export const DEFAULT_WHOSEFAULT_API_URL = 'http://localhost:3333/api';

export interface McpConfig {
  apiUrl: string;
  apiToken: string;
}

export class MissingApiTokenError extends Error {
  constructor() {
    super(
      'Variável de ambiente WHOSEFAULT_API_TOKEN não definida ou vazia. Configure um token Bearer válido para iniciar o servidor whosefault-mcp.',
    );
    this.name = 'MissingApiTokenError';
  }
}

/**
 * Normaliza a URL base da API removendo espaços e barras finais excedentes.
 */
export function normalizeApiUrl(rawUrl?: string): string {
  const trimmed = rawUrl?.trim();
  const baseUrl = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_WHOSEFAULT_API_URL;
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Carrega e valida as variáveis de ambiente necessárias para o whosefault-mcp.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiToken = env.WHOSEFAULT_API_TOKEN?.trim();
  if (!apiToken) {
    throw new MissingApiTokenError();
  }

  return {
    apiUrl: normalizeApiUrl(env.WHOSEFAULT_API_URL),
    apiToken,
  };
}

/**
 * Carrega a configuração ou encerra o processo escrevendo apenas em stderr (RNF-02 / CA-01).
 */
export function loadConfigOrExit(
  env: NodeJS.ProcessEnv = process.env,
  exitFn: (code: number) => never = process.exit,
): McpConfig {
  try {
    return loadConfig(env);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Erro inesperado ao validar a configuração de ambiente do whosefault-mcp.';
    console.error(`[whosefault-mcp] ${message}`);
    return exitFn(1);
  }
}
