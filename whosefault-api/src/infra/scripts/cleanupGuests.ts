import { prismaUserRepository } from '../repositories/prismaUserRepository.js';
import { cleanupExpiredGuests } from '../../application/cleanupGuests.js';
import { FirebaseTokenVerifier } from '../auth/firebaseTokenVerifier.js';

async function run() {
  console.log('[Cleanup] Iniciando rotina de expurgo de contas de visitantes inativas (> 30 dias)...');
  new FirebaseTokenVerifier();

  try {
    const result = await cleanupExpiredGuests(prismaUserRepository);
    console.log(`[Cleanup] Concluído com sucesso:`);
    console.log(`- Usuários removidos do PostgreSQL: ${result.deletedCount}`);
    console.log(`- Usuários removidos do Firebase Auth: ${result.firebaseDeletedCount}`);
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
