import {
  StorageFileNotFoundError,
  type IStorageService,
  type UploadFileParams,
} from '../../domain/services/IStorageService.js';

export function resolveExtensionFromMimeType(mimeType: string, filename?: string): string {
  const normalized = mimeType.toLowerCase().trim();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';

  if (filename) {
    const parts = filename.split('.');
    if (parts.length > 1) {
      const ext = parts[parts.length - 1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ext) return ext;
    }
  }
  return 'bin';
}

interface StoredObject {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Implementação em memória de IStorageService para suíte de testes unitários e CI offline (SPEC-08 RNF-02, CA-09).
 */
export class StubStorageService implements IStorageService {
  private readonly store = new Map<string, StoredObject>();

  async uploadFile(params: UploadFileParams): Promise<{ storagePath: string; url: string }> {
    const ext = resolveExtensionFromMimeType(params.mimeType, params.filename);
    const objectId = params.evidenceId ?? crypto.randomUUID();
    const storagePath = `occurrences/${params.occurrenceId}/${objectId}.${ext}`;

    this.store.set(storagePath, {
      buffer: Buffer.from(params.buffer),
      mimeType: params.mimeType,
    });

    return {
      storagePath,
      url: `gs://stub-bucket/${storagePath}`,
    };
  }

  async getFileBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const entry = this.store.get(storagePath);
    if (!entry) {
      throw new StorageFileNotFoundError(storagePath);
    }

    return {
      buffer: Buffer.from(entry.buffer),
      mimeType: entry.mimeType,
    };
  }

  async getFileBase64(storagePath: string): Promise<{ base64: string; mimeType: string }> {
    const { buffer, mimeType } = await this.getFileBuffer(storagePath);
    return {
      base64: buffer.toString('base64'),
      mimeType,
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    this.store.delete(storagePath);
  }

  hasFile(storagePath: string): boolean {
    return this.store.has(storagePath);
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
