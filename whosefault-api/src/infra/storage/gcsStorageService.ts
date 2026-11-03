import { Storage, type StorageOptions } from '@google-cloud/storage';
import {
  StorageFileNotFoundError,
  StorageProviderError,
  type IStorageService,
  type UploadFileParams,
} from '../../domain/services/IStorageService.js';
import { resolveExtensionFromMimeType } from './stubStorageService.js';

export interface GcsStorageServiceOptions {
  bucketName?: string;
  projectId?: string;
  storageClient?: Storage;
}

function inferMimeTypeFromPath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Implementação concreta de armazenamento no Google Cloud Storage (SPEC-08 RF-03, RNF-01, RNF-04).
 * Autentica via Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS / ADC) ou Service Account.
 */
export class GcsStorageService implements IStorageService {
  private readonly bucketName: string | undefined;
  private readonly projectId: string | undefined;
  private client: Storage | undefined;

  constructor(options: GcsStorageServiceOptions = {}) {
    const rawBucket = options.bucketName ?? process.env.GCS_BUCKET_NAME;
    this.bucketName = rawBucket && rawBucket.trim().length > 0 ? rawBucket.trim() : undefined;
    this.projectId =
      options.projectId ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.FIREBASE_PROJECT_ID;
    this.client = options.storageClient;
  }

  private getBucket() {
    if (!this.bucketName) {
      throw new StorageProviderError(
        'GCS_BUCKET_NAME não configurado para armazenamento de evidências em foto.',
      );
    }

    if (!this.client) {
      const storageOpts: StorageOptions = {};
      if (this.projectId) {
        storageOpts.projectId = this.projectId;
      }
      this.client = new Storage(storageOpts);
    }

    return this.client.bucket(this.bucketName);
  }

  async uploadFile(params: UploadFileParams): Promise<{ storagePath: string; url: string }> {
    const bucket = this.getBucket();
    const ext = resolveExtensionFromMimeType(params.mimeType, params.filename);
    const objectId = params.evidenceId ?? crypto.randomUUID();
    const storagePath = `occurrences/${params.occurrenceId}/${objectId}.${ext}`;

    try {
      const file = bucket.file(storagePath);
      await file.save(params.buffer, {
        contentType: params.mimeType,
        resumable: false,
      });

      return {
        storagePath,
        url: `gs://${this.bucketName}/${storagePath}`,
      };
    } catch (err) {
      const errName = err instanceof Error ? err.name : 'UnknownError';
      console.error('[GcsStorageService] Falha ao enviar arquivo para o GCP Storage.', {
        errName,
        occurrenceId: params.occurrenceId,
      });
      throw new StorageProviderError('Não foi possível salvar a imagem no Google Cloud Storage.');
    }
  }

  async getFileBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const bucket = this.getBucket();
    const file = bucket.file(storagePath);

    try {
      const [metadata] = await file.getMetadata();
      const [buffer] = await file.download();
      const mimeType =
        (typeof metadata?.contentType === 'string' && metadata.contentType) ||
        inferMimeTypeFromPath(storagePath);

      return { buffer, mimeType };
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;
      if (code === 404) {
        throw new StorageFileNotFoundError(storagePath);
      }

      const errName = err instanceof Error ? err.name : 'UnknownError';
      console.error('[GcsStorageService] Falha ao baixar arquivo do GCP Storage.', {
        errName,
        code,
      });
      throw new StorageProviderError('Não foi possível recuperar a imagem do Google Cloud Storage.');
    }
  }

  async getFileBase64(storagePath: string): Promise<{ base64: string; mimeType: string }> {
    const { buffer, mimeType } = await this.getFileBuffer(storagePath);
    return {
      base64: buffer.toString('base64'),
      mimeType,
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    const bucket = this.getBucket();
    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
    } catch (err) {
      const errName = err instanceof Error ? err.name : 'UnknownError';
      console.error('[GcsStorageService] Falha ao excluir arquivo do GCP Storage.', {
        errName,
      });
      throw new StorageProviderError('Não foi possível remover a imagem do Google Cloud Storage.');
    }
  }
}
