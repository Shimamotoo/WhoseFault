export class StorageFileNotFoundError extends Error {
  constructor(storagePath: string) {
    super(`Arquivo não encontrado no storage: ${storagePath}`);
    this.name = 'StorageFileNotFoundError';
  }
}

export class StorageProviderError extends Error {
  constructor(message = 'Falha ao operar no provedor de armazenamento de arquivos.') {
    super(message);
    this.name = 'StorageProviderError';
  }
}

export interface UploadFileParams {
  occurrenceId: string;
  evidenceId?: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Contrato abstrato para armazenamento de arquivos de evidência (SPEC-08 RNF-01 / ADR-001).
 * Isola o domínio e os casos de uso do SDK concreto do Google Cloud Storage.
 */
export interface IStorageService {
  uploadFile(params: UploadFileParams): Promise<{ storagePath: string; url: string }>;
  getFileBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string }>;
  getFileBase64(storagePath: string): Promise<{ base64: string; mimeType: string }>;
  deleteFile(storagePath: string): Promise<void>;
}
