import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // vmThreads garante compatibilidade no Windows/Node 24; no Linux (CI), forks usa o loader nativo do Node 22+ com suporte a require(esm)
    pool: process.platform === "win32" ? "vmThreads" : "forks",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // Executa arquivos em sequencia para evitar deadlocks de truncagem concorrente no banco relacional
    fileParallelism: false,
  },
});
