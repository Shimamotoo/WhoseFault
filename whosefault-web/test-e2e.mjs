import { spawn } from "child_process";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SCREENSHOTS_DIR = path.resolve("./screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function waitUrl(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function run() {
  console.log("🚀 Starting Vite dev server on 127.0.0.1:5173...");
  const vite = spawn("npx.cmd", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
    stdio: "inherit",
    shell: true,
  });

  try {
    await waitUrl("http://127.0.0.1:5173");
    console.log("✅ Vite dev server is responding on http://127.0.0.1:5173");

    console.log("🌐 Launching Microsoft Edge headless via puppeteer-core...");
    const browser = await puppeteer.launch({
      executablePath: EDGE_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Visitar Listagem
    console.log("🧪 Step 1: Validating /occurrences list page...");
    await page.goto("http://127.0.0.1:5173/occurrences", { waitUntil: "networkidle0" });

    const htmlClasses = await page.evaluate(() => document.documentElement.className);
    console.log(`- HTML class (Dark Mode): "${htmlClasses}" (expected "dark")`);
    if (!htmlClasses.includes("dark")) throw new Error("Dark mode class missing on html!");

    const cardsCount = await page.$$eval('[data-testid^="occurrence-card-"]', (els) => els.length);
    console.log(`- Occurrence Cards count: ${cardsCount} (expected 4)`);
    if (cardsCount !== 4) throw new Error(`Expected 4 cards, found ${cardsCount}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01_occurrences_list.png") });
    console.log("📸 Saved screenshot: 01_occurrences_list.png");

    // 2. Testar Empty State
    console.log("🧪 Step 2: Testing Empty State toggle...");
    await page.click('[data-testid="toggle-empty-state"]');
    await page.waitForSelector('[data-testid="occurrences-empty-state"]', { timeout: 3000 });
    console.log("✅ Empty state correctly rendered!");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02_empty_state.png") });
    console.log("📸 Saved screenshot: 02_empty_state.png");

    // Desativa empty state
    await page.click('[data-testid="toggle-empty-state"]');
    await page.waitForSelector('[data-testid^="occurrence-card-"]', { timeout: 3000 });

    // 3. Navegar para a tela de Detalhes (SPEC-01 / SPEC-03)
    console.log("🧪 Step 3: Navigating to Occurrence Details (/occurrences/occ-stripe-webhook-500)...");
    await page.click('[data-testid="occurrence-card-occ-stripe-webhook-500"]');
    await page.waitForSelector('[data-testid="occurrence-detail-title"]', { timeout: 3000 });

    const titleText = await page.$eval('[data-testid="occurrence-detail-title"]', (el) => el.textContent);
    console.log(`- Detail Title: "${titleText}"`);
    const urlText = await page.$eval('[data-testid="occurrence-detail-url"]', (el) => el.textContent);
    console.log(`- Detail URL: "${urlText}"`);

    // Validar Aba Geral
    const descriptionText = await page.$eval('[data-testid="occurrence-description-content"]', (el) => el.textContent);
    console.log(`- Description length: ${descriptionText?.length} chars`);
    const outdatedAlert = await page.$('[data-testid="diagnosis-outdated-alert"]');
    console.log(`- Outdated Diagnosis banner present: ${Boolean(outdatedAlert)}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03_occurrence_details_geral.png") });
    console.log("📸 Saved screenshot: 03_occurrence_details_geral.png");

    // 4. Testar Aba de Evidências (SPEC-03)
    console.log("🧪 Step 4: Testing Tab 2 (Evidências with Accordion & monospace formatting)...");
    await page.click('[data-testid="tab-trigger-evidencias"]');
    await page.waitForSelector('[data-testid^="evidence-item-"]', { timeout: 3000 });

    const evidencesCount = await page.$$eval('[data-testid^="evidence-item-"]', (els) => els.length);
    console.log(`- Evidences rendered in Accordion: ${evidencesCount} (expected 4)`);
    if (evidencesCount !== 4) throw new Error(`Expected 4 evidences, found ${evidencesCount}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04_occurrence_details_evidences.png") });
    console.log("📸 Saved screenshot: 04_occurrence_details_evidences.png");

    // 5. Testar Botão "Solicitar Diagnóstico IA" (Passo 5 - Bloqueio 5 segundos)
    console.log("🧪 Step 5: Testing 'Solicitar Diagnóstico IA' button (5s simulation & screen lock)...");
    await page.click('[data-testid="btn-request-diagnosis"]');

    // Verificar se o banner de loading apareceu imediatamente
    await page.waitForSelector('[data-testid="diagnosis-loading-banner"]', { timeout: 1000 });
    console.log("✅ Diagnosis loading banner displayed with spinner!");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05_diagnosis_in_progress_locked.png") });
    console.log("📸 Saved screenshot: 05_diagnosis_in_progress_locked.png");

    console.log("⏳ Waiting 5.2s for simulated diagnosis generation to finish...");
    await new Promise((r) => setTimeout(r, 5200));

    const bannerAfter = await page.$('[data-testid="diagnosis-loading-banner"]');
    if (bannerAfter) throw new Error("Diagnosis banner should have disappeared after 5s!");
    console.log("✅ Interface unlocked and diagnosis finished successfully!");

    // Retorna para a aba Geral e valida que agora o diagnóstico está atualizado
    await page.click('[data-testid="tab-trigger-geral"]');
    const outdatedAlertAfter = await page.$('[data-testid="diagnosis-outdated-alert"]');
    console.log(`- Outdated Alert after regeneration: ${Boolean(outdatedAlertAfter)} (expected false)`);
    if (outdatedAlertAfter) throw new Error("Diagnosis should now be marked as updated!");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "06_diagnosis_completed_updated.png") });
    console.log("📸 Saved screenshot: 06_diagnosis_completed_updated.png");

    await browser.close();
    console.log("\n🎉 ALL VISUAL AND E2E ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
  } finally {
    vite.kill();
    try {
      process.kill(-vite.pid);
    } catch {
      // ignore
    }
  }
}

run().catch((err) => {
  console.error("❌ E2E Test Failed:", err);
  process.exit(1);
});
