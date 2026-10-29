export interface TitleGenerationJobData {
  occurrenceId: string;
  description: string;
}

export interface ITitleQueue {
  enqueue(data: TitleGenerationJobData): Promise<void>;
}

