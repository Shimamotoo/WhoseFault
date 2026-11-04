import type { IUserRepository } from '../domain/repositories/IUserRepository.js';
import type { IOccurrenceRepository } from '../domain/repositories/IOccurrenceRepository.js';
import type { IEvidenceRepository } from '../domain/repositories/IEvidenceRepository.js';
import type { IStorageService } from '../domain/services/IStorageService.js';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface ICleanupResult {
  deletedCount: number;
  firebaseDeletedCount: number;
  firebaseErrors: string[];
  /** Quantidade de arquivos de evidências IMAGE removidos do storage (PA-07). */
  storageDeletedCount: number;
  /** Falhas individuais ao remover arquivos do storage (não interrompem o expurgo) (PA-07). */
  storageErrors: string[];
}

export interface ICleanupOptions {
  daysInactive?: number;
  deleteFromFirebase?: boolean;
  /**
   * PA-07: quando os três repositórios/serviços abaixo forem informados, os arquivos físicos das
   * evidências IMAGE dos visitantes expirados são removidos do storage ANTES da deleção em cascata
   * no banco (que apagaria as referências e deixaria os objetos órfãos no bucket).
   */
  occurrenceRepo?: IOccurrenceRepository;
  evidenceRepo?: IEvidenceRepository;
  storageService?: IStorageService;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Remove do storage os arquivos de evidências IMAGE pertencentes às ocorrências dos usuários informados.
 * Falhas individuais são acumuladas em `errors` para não bloquear o expurgo dos demais usuários.
 */
async function purgeGuestImageEvidences(
  userIds: string[],
  occurrenceRepo: IOccurrenceRepository,
  evidenceRepo: IEvidenceRepository,
  storageService: IStorageService,
): Promise<{ deletedCount: number; errors: string[] }> {
  let deletedCount = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    let occurrences;
    try {
      occurrences = await occurrenceRepo.findAll(userId);
    } catch (err) {
      errors.push(`Usuário ${userId}: falha ao listar ocorrências (${errorMessage(err)})`);
      continue;
    }

    for (const occurrence of occurrences) {
      let evidences;
      try {
        evidences = await evidenceRepo.findByOccurrenceId(occurrence.id);
      } catch (err) {
        errors.push(`Ocorrência ${occurrence.id}: falha ao listar evidências (${errorMessage(err)})`);
        continue;
      }

      for (const evidence of evidences) {
        if (evidence.type !== 'IMAGE' || !evidence.url) continue;
        try {
          await storageService.deleteFile(evidence.url);
          deletedCount++;
        } catch (err) {
          errors.push(`${evidence.url}: ${errorMessage(err)}`);
        }
      }
    }
  }

  return { deletedCount, errors };
}

export async function cleanupExpiredGuests(
  userRepo: IUserRepository,
  options?: ICleanupOptions,
): Promise<ICleanupResult> {
  const days = options?.daysInactive ?? 30;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const expiredUsers = await userRepo.findExpiredGuests(cutoffDate);

  if (expiredUsers.length === 0) {
    return {
      deletedCount: 0,
      firebaseDeletedCount: 0,
      firebaseErrors: [],
      storageDeletedCount: 0,
      storageErrors: [],
    };
  }

  const ids = expiredUsers.map((u) => u.id);
  const uids = expiredUsers.map((u) => u.firebaseUid);

  // 1. Remove imagens do storage antes da cascata do banco apagar as referências (PA-07)
  let storageDeletedCount = 0;
  let storageErrors: string[] = [];
  if (options?.occurrenceRepo && options?.evidenceRepo && options?.storageService) {
    const storageResult = await purgeGuestImageEvidences(
      ids,
      options.occurrenceRepo,
      options.evidenceRepo,
      options.storageService,
    );
    storageDeletedCount = storageResult.deletedCount;
    storageErrors = storageResult.errors;
  }

  // 2. Deleta do PostgreSQL (deleção em cascata remove ocorrências, evidências e diagnósticos)
  const deletedCount = await userRepo.deleteMany(ids);

  // 3. Deleta do Firebase Authentication em lotes (até 1000 por chamada)
  let firebaseDeletedCount = 0;
  const firebaseErrors: string[] = [];

  if (options?.deleteFromFirebase !== false && getApps().length > 0) {
    const auth = getAuth();
    const chunkSize = 1000;
    for (let i = 0; i < uids.length; i += chunkSize) {
      const chunk = uids.slice(i, i + chunkSize);
      try {
        const deleteResult = await auth.deleteUsers(chunk);
        firebaseDeletedCount += deleteResult.successCount;
        if (deleteResult.errors.length > 0) {
          firebaseErrors.push(
            ...deleteResult.errors.map(
              (e: { index: number; error: { message: string } }) =>
                `UID ${chunk[e.index]}: ${e.error.message}`,
            ),
          );
        }
      } catch (err) {
        firebaseErrors.push(errorMessage(err));
      }
    }
  }

  return {
    deletedCount,
    firebaseDeletedCount,
    firebaseErrors,
    storageDeletedCount,
    storageErrors,
  };
}
