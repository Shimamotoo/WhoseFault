import { prismaUserRepository } from '../repositories/prismaUserRepository.js';
import { prismaOccurrenceRepository } from '../repositories/prismaOccurrenceRepository.js';
import { prismaEvidenceRepository } from '../repositories/prismaEvidenceRepository.js';
import { cleanupExpiredGuests } from '../../application/cleanupGuests.js';
import { ensureFirebaseAdminInitialized } from '../auth/firebaseTokenVerifier.js';
import { GcsStorageService } from '../storage/gcsStorageService.js';

async function run() {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignora caso o arquivo .env não exista no ambiente atual (ex.: variáveis injetadas pelo container)
  }

  console.log('[Cleanup] Iniciando rotina de expurgo de contas de visitantes inativas (> 30 dias)...');

  // PA-06: inicializa explicitamente o Firebase Admin (com conta de serviço quando disponível),
  // necessário para getAuth().deleteUsers() dentro de cleanupExpiredGuests
  ensureFirebaseAdminInitialized();

  try {
    // PA-07: injeta repositórios e storage para remover as imagens do GCS antes da cascata no banco
    const result = await cleanupExpiredGuests(prismaUserRepository, {
      occurrenceRepo: prismaOccurrenceRepository,
      evidenceRepo: prismaEvidenceRepository,
      storageService: new GcsStorageService(),
    });
    console.log(`[Cleanup] Concluído com sucesso:`);
    console.log(`- Imagens removidas do Google Cloud Storage: ${result.storageDeletedCount}`);
    console.log(`- Usuários removidos do PostgreSQL: ${result.deletedCount}`);
    console.log(`- Usuários removidos do Firebase Auth: ${result.firebaseDeletedCount}`);
    if (result.storageErrors.length > 0) {
      console.warn(`- Avisos/erros do Storage:`, result.storageErrors);
    }
    if (result.firebaseErrors.length > 0) {
      console.warn(`- Avisos/erros do Firebase:`, result.firebaseErrors);
    }
    process.exit(0);
  } catch (err) {
    console.error('[Cleanup] Erro durante a execução:', err);
    process.exit(1);
  }
}

run();
