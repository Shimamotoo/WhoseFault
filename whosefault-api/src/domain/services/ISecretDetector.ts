export const SECRET_ALERT_MESSAGE =
  'Remova ou mascare segredos/tokens/API-Keys antes do envio';

export const SECRET_SECURITY_GUIDANCE =
  '1. Remova ou mascare o segredo no conteúdo que deseja registrar. ' +
  '2. Revogue ou rotacione a credencial no serviço de origem caso ela já tenha sido exposta. ' +
  '3. Gere uma nova credencial quando necessário. ' +
  'Atenção: apagar ou editar a evidência no WhoseFault não invalida uma credencial que já tenha sido exposta.';

export interface SecretInspectionInput {
  url?: string;
  headers?: Record<string, string>;
  payload?: string;
  body?: string;
  content?: string;
  context?: string;
  notes?: string;
}

export interface SecretDetectionResult {
  hasSecrets: boolean;
  detectedFields: string[];
  alertMessage: string;
  securityGuidance: string;
}

export class SensitiveDataDetectedError extends Error {
  readonly detectedFields: string[];
  readonly alertMessage: string;
  readonly securityGuidance: string;

  constructor(detectedFields: string[]) {
    super(SECRET_ALERT_MESSAGE);
    this.name = 'SensitiveDataDetectedError';
    this.detectedFields = detectedFields;
    this.alertMessage = SECRET_ALERT_MESSAGE;
    this.securityGuidance = SECRET_SECURITY_GUIDANCE;
  }
}

/**
 * Contrato para o serviço de detecção de dados sensíveis e segredos.
 * Mantém a lógica de segurança desacoplada e testável via Inversão de Dependência.
 */
export interface ISecretDetector {
  /**
   * Analisa os campos de uma evidência em busca de possíveis segredos.
   */
  inspect(input: SecretInspectionInput): SecretDetectionResult;

  /**
   * Valida os campos de uma evidência e lança SensitiveDataDetectedError
   * caso identifique algum padrão de segredo não mascarado.
   */
  assertNoSecrets(input: SecretInspectionInput): void;
}
