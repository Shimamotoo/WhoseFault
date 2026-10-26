import type { DiagnosisContext, DiagnosisResult } from '../../domain/diagnosis.js';
import type { IDiagnosisGenerator } from '../../domain/services/IDiagnosisGenerator.js';

/**
 * Implementação stub de IDiagnosisGenerator para ambiente de testes quando nenhum gerador é injetado.
 */
export class StubDiagnosisGenerator implements IDiagnosisGenerator {
  async generate(_context: DiagnosisContext): Promise<DiagnosisResult> {
    return {
      facts_observed: ['Fato observado simulado a partir das evidências.'],
      hypotheses: [
        {
          cause: 'Hipótese simulada para ambiente de teste.',
          evidence_support: 'Evidências fornecidas na ocorrência.',
        },
      ],
      missing_information: ['Nenhuma informação adicional pendente no stub.'],
    };
  }
}
