import type { IUserRepository } from '../domain/repositories/IUserRepository.js';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface ICleanupResult {
  deletedCount: number;
  firebaseDeletedCount: number;
  firebaseErrors: string[];
}

export async function cleanupExpiredGuests(
  userRepo: IUserRepository,
  options?: {
    daysInactive?: number;
    deleteFromFirebase?: boolean;
  },
): Promise<ICleanupResult> {
  const days = options?.daysInactive ?? 30;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const expiredUsers = await userRepo.findExpiredGuests(cutoffDate);

  if (expiredUsers.length === 0) {
    return {
      deletedCount: 0,
      firebaseDeletedCount: 0,
      firebaseErrors: [],
    };
  }

  const ids = expiredUsers.map((u) => u.id);
  const uids = expiredUsers.map((u) => u.firebaseUid);

  // 1. Deleta do PostgreSQL (deleção em cascata remove ocorrências, evidências e diagnósticos)
  const deletedCount = await userRepo.deleteMany(ids);

  // 2. Deleta do Firebase Authentication em lotes (até 1000 por chamada)
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
        firebaseErrors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  return {
    deletedCount,
    firebaseDeletedCount,
    firebaseErrors,
  };
}
