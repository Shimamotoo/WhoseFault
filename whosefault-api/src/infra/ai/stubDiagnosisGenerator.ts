import type { DiagnosisContext, DiagnosisResult } from '../../domain/diagnosis.js';
import type {
  DiagnosisInlineImage,
  GenerateDiagnosisOptions,
  IDiagnosisGenerator,
} from '../../domain/services/IDiagnosisGenerator.js';

/**
 * Implementação stub de IDiagnosisGenerator para ambiente de testes quando nenhum gerador é injetado.
 */
export class StubDiagnosisGenerator implements IDiagnosisGenerator {
  public lastReceivedImages: DiagnosisInlineImage[] = [];

  async generate(
    _context: DiagnosisContext,
    options?: GenerateDiagnosisOptions,
  ): Promise<DiagnosisResult> {
    this.lastReceivedImages = options?.images ? [...options.images] : [];

    const facts = ['Fato observado simulado a partir das evidências.'];
    if (this.lastReceivedImages.length > 0) {
      facts.push(
        `Análise visual simulada de ${this.lastReceivedImages.length} evidência(s) em imagem (Base64).`,
      );
    }

    return {
      facts_observed: facts,
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
