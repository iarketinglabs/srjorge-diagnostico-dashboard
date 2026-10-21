// Utilitários compartilhados pelos testes de export. Não é um arquivo de teste (não casa com *.test.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import pdfmake from "pdfmake";
import { getDocument } from "pdfjs-dist/build/pdf.mjs";
import { buildPdfDefinition, PDF_FONT_NAMES, renderPdf } from "../src/lib/export/toPdf.ts";
import { createEmMeasurer } from "../src/lib/export/fontMetrics.ts";
import { prepareDocument } from "../src/lib/export/document.ts";
import { buildMeta } from "../src/lib/export/meta.ts";
import { parseMarkdown } from "../src/lib/export/parse.ts";
import { normalizeMarkdown, plainText } from "../src/lib/export/normalize.ts";

// pdf.js 6 chama Uint8Array#toHex, que o Node 24 ainda não tem; sem isso a leitura do PDF falha.
if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value: function toHex() {
      return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("hex");
    },
  });
}
// No navegador o pdfmake já bloqueia acesso a arquivos locais; no Node a política precisa ser explícita.
pdfmake.setLocalAccessPolicy(() => false);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "..");
export const fixturePath = path.join(scriptDir, "fixtures", "all-constructs.md");
const fontDir = path.join(repoRoot, "src", "assets", "pdf-fonts");

const FONT_SOURCE = {
  "DejaVuSans.ttf": "DejaVuSans.subset.ttf",
  "DejaVuSans-Bold.ttf": "DejaVuSans-Bold.subset.ttf",
  "DejaVuSans-Oblique.ttf": "DejaVuSans-Oblique.subset.ttf",
  "DejaVuSans-BoldOblique.ttf": "DejaVuSans-BoldOblique.subset.ttf",
  "DejaVuSansMono.ttf": "DejaVuSansMono.subset.ttf",
  "DejaVuSansMono-Bold.ttf": "DejaVuSansMono-Bold.subset.ttf",
};

export function fontBytes() {
  const out = {};
  for (const name of PDF_FONT_NAMES) out[name] = new Uint8Array(fs.readFileSync(path.join(fontDir, FONT_SOURCE[name])));
  return out;
}

/** Medidor da face mais larga usada nas tabelas (negrito), como o navegador faz. */
export function boldMeasurer() {
  return createEmMeasurer(new Uint8Array(fs.readFileSync(path.join(fontDir, FONT_SOURCE["DejaVuSans-Bold.ttf"]))));
}

export function fontFile(name) {
  return path.join(fontDir, FONT_SOURCE[name]);
}

/** Converte um arquivo markdown no mesmo ExportInput que o painel envia. */
export function fileFromBody({ name, title, body, status = null, path: filePath = `teste/${name}` }) {
  return { path: filePath, name, title, status, body };
}

export function documentFor(file, now = new Date("2026-10-21T12:00:00Z")) {
  const meta = buildMeta({ file, editedBy: null, editedAt: null, now });
  return { doc: prepareDocument(file), meta };
}

/** Gera o PDF pelo mesmo caminho do navegador, usando o pdfmake do Node e as fontes do repo. */
export async function renderPdfForTest(file) {
  const { doc, meta } = documentFor(file);
  const { definition, report } = buildPdfDefinition(doc, meta, boldMeasurer());
  const blob = await renderPdf(pdfmake, definition, fontBytes());
  return { buffer: Buffer.from(await blob.arrayBuffer()), report, definition, doc, meta };
}

export async function renderDocxForTest(file) {
  const { buildDocx } = await import("../src/lib/export/toDocx.ts");
  const { doc, meta } = documentFor(file);
  const blob = await buildDocx(doc, meta);
  return { buffer: Buffer.from(await blob.arrayBuffer()), doc, meta };
}

/** Partes XML de um .docx, já validadas quanto a bem-formação. */
export async function readDocxParts(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const parts = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const xml = await entry.async("string");
      const check = XMLValidator.validate(xml);
      if (check !== true) throw new Error(`XML inválido em ${name}: ${check.err.msg}`);
      parts[name] = xml;
    } else {
      parts[name] = null;
    }
  }
  return parts;
}

export function docxParser() {
  return new XMLParser({ ignoreAttributes: false, preserveOrder: false, trimValues: false, processEntities: true });
}

/** Todo o texto visível do document.xml, parágrafo a parágrafo, separado por espaço. */
export function docxVisibleText(documentXml) {
  const withBreaks = documentXml.replace(/<\/w:p>/g, "\n");
  return withBreaks
    .replace(/<w:tab\/>|<w:br\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function pdfText(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  // pdf.js separa glifos de fonte monoespaçada com espaços extras; o conteúdo continua o mesmo.
  return { numPages: doc.numPages, pages, text: pages.join("\n").replace(/\s+/g, " ") };
}

/** Palavras (letras e dígitos, ≥2 caracteres) em minúsculas: a unidade de comparação de cobertura. */
export function words(text) {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []));
}

/** Todo o texto do documento neutro, incluindo código e células de tabela. */
export function blocksText(blocks) {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
          return plainText(block.children);
        case "list":
          return block.items.map((item) => blocksText(item.blocks)).join("\n");
        case "code":
          return block.value;
        case "quote":
          return blocksText(block.blocks);
        case "table":
          return [block.head, ...block.rows].flatMap((row) => row.map((cell) => plainText(cell))).join(" ");
        default:
          return "";
      }
    })
    .join("\n");
}

export function countBlocks(blocks, type) {
  let count = 0;
  for (const block of blocks) {
    if (block.type === type) count++;
    if (block.type === "list") for (const item of block.items) count += countBlocks(item.blocks, type);
    if (block.type === "quote") count += countBlocks(block.blocks, type);
  }
  return count;
}

export function sourceDocument(body) {
  return normalizeMarkdown(parseMarkdown(body));
}

/**
 * Pasta de origem da base documental (executions/src/diagnostico do SrJorge).
 * Defina DIAGNOSTICO_SRC para apontar outra cópia; sem ela e sem a pasta irmã, o teste de corpus é pulado.
 */
export function resolveDiagnosticoSource() {
  const fromEnv = process.env.DIAGNOSTICO_SRC;
  const candidates = [fromEnv, path.resolve(repoRoot, "..", "SrJorge", "executions", "src", "diagnostico")].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** Visíveis no painel, exatamente como o build do painel os gera. */
export function buildVisibleCorpus() {
  const src = resolveDiagnosticoSource();
  if (!src) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srjorge-export-corpus-"));
  const out = path.join(dir, "content.json");
  execFileSync(process.execPath, [path.join(scriptDir, "build-content.mjs"), "--src", src, "--out", out], {
    encoding: "utf8",
  });
  const content = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return content.docs.files.map((file) => ({ ...file, body: file.body }));
}
