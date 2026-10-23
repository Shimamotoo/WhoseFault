import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // vmThreads garante isolamento seguro e compatibilidade de resolucao de modulos no Windows/Node 24
    pool: "vmThreads",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // Executa arquivos em sequencia para evitar deadlocks de truncagem concorrente no banco relacional
    fileParallelism: false,
  },
});
