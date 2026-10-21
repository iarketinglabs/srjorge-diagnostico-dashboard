// Teste de ponta a ponta da exportação do painel: abre o site de verdade, exporta e valida os arquivos baixados.
// Uso (servidor local já rodando com `npm run preview`):
//   DASHBOARD_PASSWORD="..." node e2e/export.e2e.mjs
// Contra o site publicado:
//   E2E_BASE="https://iarketinglabs.github.io/srjorge-diagnostico-dashboard/" DASHBOARD_PASSWORD="..." node e2e/export.e2e.mjs
// A senha vem só do ambiente e nunca é gravada. Os arquivos baixados ficam em e2e/out/ (ignorado pelo git).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/build/pdf.mjs";

// pdf.js 6 usa Uint8Array#toHex, que o Node 24 ainda não tem.
if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value: function toHex() {
      return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("hex");
    },
  });
}

const BASE = (process.env.E2E_BASE ?? "http://localhost:4173/srjorge-diagnostico-dashboard/").replace(/\/?$/, "/");
const PASSWORD = process.env.DASHBOARD_PASSWORD;
const CHANNEL = process.env.E2E_CHANNEL ?? "chrome";
const USER = process.env.E2E_USER ?? "Pedro Armbrust";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out", new Date().toISOString().replace(/[:.]/g, "-"));

if (!PASSWORD) {
  console.error("Defina DASHBOARD_PASSWORD no ambiente (não é gravada).");
  process.exit(1);
}

// Documentos escolhidos: pequeno, grande com tabelas e grande com muitas linhas. Todos no primeiro nível do grafo.
const DOCS = ["indice-entregaveis", "matriz-evidencias", "registro-atualizacoes"];
const SUPABASE_HOST = "eesxufjzpmrjdejaojtd.supabase.co";

const results = [];
async function check(name, fn) {
  const started = performance.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - started) });
    console.log(`  ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  FAIL ${name}\n       ${error.message.split("\n").join("\n       ")}`);
  }
}

/** Mesmo decrypt do painel: lê o data.enc servido por BASE, para comparar o md exportado com o corpo. */
async function loadContent() {
  const response = await fetch(new URL("data.enc", BASE));
  assert.equal(response.status, 200, "data.enc não encontrado");
  const payload = JSON.parse(await response.text());
  const data = Buffer.from(payload.data, "base64");
  const key = crypto.pbkdf2Sync(PASSWORD, Buffer.from(payload.salt, "base64"), payload.iterations, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pdfPageTexts(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages;
}

fs.mkdirSync(OUT, { recursive: true });
console.log(`Base: ${BASE}\nSaída: ${OUT}\n`);

const content = await loadContent();
const byName = new Map(content.docs.files.map((file) => [file.name.replace(/\.md$/, ""), file]));
for (const name of DOCS) assert.ok(byName.has(name), `documento ${name} não está nos visíveis`);

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 860 }, locale: "pt-BR" });
const page = await context.newPage();

const consoleErrors = [];
const supabaseWrites = [];
const requests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on("request", (request) => {
  requests.push(request.url());
  if (request.url().includes(SUPABASE_HOST) && request.method() !== "GET") supabaseWrites.push(`${request.method()} ${request.url()}`);
});
page.on("dialog", (dialog) => dialog.accept());

async function unlock() {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  if (await page.locator("#dashboard-password").count()) {
    await page.locator("#dashboard-password").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
  }
  await page.getByRole("button", { name: USER }).click({ timeout: 20000 });
  await page.locator(".dashboard-body").waitFor({ timeout: 20000 });
}

async function openDoc(name) {
  await page.locator("g.graph-node").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`) }).first().click();
  const title = byName.get(name).title;
  await page.locator(".reader-title").filter({ hasText: title }).first().waitFor({ timeout: 20000 });
}

const exportTrigger = () => page.locator(".export-menu > button");
const menuItem = (label) => page.getByRole("menuitem", { name: new RegExp(`^${label}`) });

async function exportAs(label) {
  await exportTrigger().click();
  await page.getByRole("menu").waitFor();
  const started = performance.now();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), menuItem(label).click()]);
  const elapsed = Math.round(performance.now() - started);
  const file = path.join(OUT, download.suggestedFilename());
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), elapsed };
}

console.log("Carregamento");
await check("painel abre com senha e usuário, sem baixar código de exportação", async () => {
  await unlock();
  const lazy = requests.filter((url) => /\/assets\/(toDocx|pdfmake|engine|fonts|fontMetrics|toPdf)-|DejaVu/.test(url));
  assert.deepEqual(lazy, [], `código de exportação baixado antes do clique: ${lazy.join(", ")}`);
});

console.log("\nExportação por documento");
for (const name of DOCS) {
  const doc = byName.get(name);
  await check(`${name}: docx com integridade`, async () => {
    await openDoc(name);
    const { file, name: filename, elapsed } = await exportAs("Word");
    assert.equal(filename, `${name}.docx`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "PK\u0003\u0004", "não é um zip");
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml").async("string");
    assert.ok(xml.includes(escapeXml(doc.title)), "título ausente no .docx");
    const visible = xml.replace(/<[^>]+>/g, " ");
    assert.ok(visible.includes("Sr Jorge") || visible.includes("Sr. Jorge"), "cabeçalho do cliente ausente no .docx");
    console.log(`       ${filename} · ${bytes.length} bytes · ${elapsed} ms`);
  });

  await check(`${name}: pdf com texto selecionável e paginação`, async () => {
    const { file, name: filename, elapsed } = await exportAs("PDF");
    assert.equal(filename, `${name}.pdf`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(bytes.subarray(-64).toString("latin1").includes("%%EOF"));
    const pages = await pdfPageTexts(bytes);
    assert.ok(pages.length >= 1);
    const text = pages.join(" ");
    assert.ok(text.includes(doc.title.split(" ")[0]), "título ausente no PDF");
    assert.ok(text.includes(`Página 1 de ${pages.length}`), "numeração de página ausente");
    console.log(`       ${filename} · ${bytes.length} bytes · ${pages.length} página(s) · ${elapsed} ms`);
  });

  await check(`${name}: md idêntico ao corpo exibido`, async () => {
    const { file, name: filename } = await exportAs("Markdown");
    assert.equal(filename, `${name}.md`);
    const exported = fs.readFileSync(file).toString("utf8");
    const edited = await page.locator(".reader-edited-note").count();
    if (edited > 0) {
      // Documento com edição feita no site: o corpo exibido é a revisão mais nova, não o data.enc.
      assert.ok(exported.length > 0);
      console.log("       (documento editado no site: comparação com o corpo publicado pulada)");
    } else {
      assert.equal(exported, doc.body, "md exportado difere do corpo do data.enc");
    }
  });
}

console.log("\nMenu e acessibilidade");
await check("menu abre com foco no primeiro item, fecha com Esc e devolve o foco ao botão", async () => {
  await openDoc(DOCS[0]);
  await exportTrigger().click();
  await page.getByRole("menu").waitFor();
  const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute("role"));
  assert.equal(focusedRole, "menuitem");
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached" });
  const focusedAfter = await page.evaluate(() => document.activeElement?.textContent ?? "");
  assert.ok(focusedAfter.includes("Exportar"), `foco não voltou ao botão: ${focusedAfter}`);
});

await check("setas percorrem o menu e clique fora fecha", async () => {
  await exportTrigger().click();
  await page.getByRole("menu").waitFor();
  await page.keyboard.press("ArrowDown");
  const second = await page.evaluate(() => document.activeElement?.textContent ?? "");
  assert.ok(second.includes("PDF"), `seta para baixo deveria ir a PDF, foi a ${second}`);
  await page.locator(".reader-doc-header .reader-title").click();
  await page.getByRole("menu").waitFor({ state: "detached" });
});

await check("botão fica desabilitado em modo de edição", async () => {
  await openDoc(DOCS[0]);
  await page.getByRole("button", { name: /Editar/ }).click();
  assert.equal(await exportTrigger().isDisabled(), true);
  await page.getByRole("button", { name: "Sair da edição" }).click();
  await exportTrigger().waitFor();
  assert.equal(await exportTrigger().isDisabled(), false);
});

console.log("\nFalhas e isolamento");
await check("falha ao carregar fontes mostra mensagem e reabilita o botão", async () => {
  await page.route(/DejaVu[^/]*\.ttf/, (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".dashboard-body").waitFor({ timeout: 20000 });
  await openDoc(DOCS[0]);
  await exportTrigger().click();
  await page.getByRole("menu").waitFor();
  await menuItem("PDF").click();
  await page.getByRole("alert").filter({ hasText: "Não foi possível gerar" }).waitFor({ timeout: 30000 });
  assert.equal(await exportTrigger().isDisabled(), false);
  await page.unroute(/DejaVu[^/]*\.ttf/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".dashboard-body").waitFor({ timeout: 20000 });
  await openDoc(DOCS[0]);
});

await check("exportação não escreve no Supabase", async () => {
  assert.deepEqual(supabaseWrites, []);
});

await check("sem erros no console durante a sessão (exceto a falha de fonte provocada)", async () => {
  // A falha provocada no teste de fontes gera erros de rede esperados; qualquer outro erro reprova.
  const unexpected = consoleErrors.filter((error) => !/ERR_FAILED|DejaVu|Failed to load resource/.test(error));
  assert.deepEqual(unexpected, []);
});

console.log("\nCelular");
await check("botão e menu cabem na tela de 390 px e o download funciona", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDoc(DOCS[0]);
  await exportTrigger().click();
  await page.getByRole("menu").waitFor();
  const box = await page.getByRole("menu").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, `menu fora da tela: x=${box.x}, largura=${box.width}`);
  await page.keyboard.press("Escape");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportTrigger().click().then(() => menuItem("Markdown").click()),
  ]);
  assert.equal(download.suggestedFilename(), `${DOCS[0]}.md`);
  await page.setViewportSize({ width: 1366, height: 860 });
});

await browser.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
fs.writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify({ base: BASE, results }, null, 2));
if (failed.length > 0) process.exit(1);

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
