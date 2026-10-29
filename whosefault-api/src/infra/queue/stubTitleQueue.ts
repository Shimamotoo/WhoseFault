import type {
  ITitleQueue,
  TitleGenerationJobData,
} from '../../domain/services/ITitleQueue.js';

/**
 * Implementação em memória (Stub / Fake) da fila de geração de títulos.
 * Garante que a suíte de testes execute 100% offline sem conexão com Redis (SPEC-07 RNF-02).
 */
export class StubTitleQueue implements ITitleQueue {
  public jobs: TitleGenerationJobData[] = [];

  async enqueue(data: TitleGenerationJobData): Promise<void> {
    this.jobs.push({ ...data });
  }

  clear(): void {
    this.jobs = [];
  }
}

export { StubTitleQueue as InMemoryTitleQueue };

