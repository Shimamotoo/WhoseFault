import type { ITitleGenerator } from '../../domain/services/ITitleGenerator.js';

/**
 * Implementação stub do gerador de título.
 * Retorna null sempre — simula IA não configurada sem quebrar o fluxo.
 * Será substituída pela integração real quando a ADR-003 for implementada.
 */
export class StubTitleGenerator implements ITitleGenerator {
  async generate(_description: string): Promise<string | null> {
    return null;
  }
}
