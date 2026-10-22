/**
 * Contrato para o serviço de geração de título via IA.
 * O domínio depende desta interface — nunca de uma implementação concreta.
 */
export interface ITitleGenerator {
  /**
   * Gera um título curto a partir da descrição fornecida.
   * Retorna null se a geração falhar ou produzir resultado inutilizável.
   */
  generate(description: string): Promise<string | null>;
}
