import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { PDF_GLYPH_RANGES } from "../src/lib/export/glyphs.ts";
import { buildPdfDefinition } from "../src/lib/export/toPdf.ts";
import { createEmMeasurer } from "../src/lib/export/fontMetrics.ts";
import { boldMeasurer, buildVisibleCorpus, documentFor, fileFromBody, fixturePath, fontFile } from "./export-harness.mjs";

// fontkit é CommonJS; o require explícito evita a interop de named exports do ESM.
const fontkit = createRequire(import.meta.url)("fontkit");

const FONT_FOR = {
  "DejaVuSans": { normal: "DejaVuSans.ttf", bold: "DejaVuSans-Bold.ttf", italics: "DejaVuSans-Oblique.ttf", bolditalics: "DejaVuSans-BoldOblique.ttf" },
  "DejaVuSansMono": { normal: "DejaVuSansMono.ttf", bold: "DejaVuSansMono-Bold.ttf", italics: "DejaVuSansMono.ttf", bolditalics: "DejaVuSansMono-Bold.ttf" },
};

const charsets = new Map();
function charsetOf(name) {
  if (!charsets.has(name)) charsets.set(name, new Set(fontkit.openSync(fontFile(name)).characterSet));
  return charsets.get(name);
}

function styleKey(node) {
  if (node.bold && node.italics) return "bolditalics";
  if (node.bold) return "bold";
  if (node.italics) return "italics";
  return "normal";
}

/** Coleta (fonte, texto) de cada folha de texto que o pdfmake vai desenhar. */
function textLeaves(node, inherited, out) {
  if (Array.isArray(node)) {
    for (const item of node) textLeaves(item, inherited, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const style = { ...inherited, ...node };
  if (typeof node.text === "string") out.push({ text: node.text, family: style.font ?? "DejaVuSans", style: styleKey(style) });
  for (const [key, value] of Object.entries(node)) {
    if (key === "text" || key === "font" || key === "bold" || key === "italics") continue;
    if (value && typeof value === "object") textLeaves(value, style, out);
  }
  return out;
}

function definitionLeaves(definition) {
  const out = [];
  textLeaves(definition.content, { font: "DejaVuSans" }, out);
  out.push(...textLeaves(definition.footer(1, 1), { font: "DejaVuSans" }, []));
  out.push(...textLeaves(definition.header(), { font: "DejaVuSans" }, []));
  return out;
}

function assertGlyphsInFonts(file) {
  const { doc, meta } = documentFor(file);
  const { definition } = buildPdfDefinition(doc, meta, boldMeasurer());
  const missing = new Map();
  for (const leaf of definitionLeaves(definition)) {
    const fileName = FONT_FOR[leaf.family]?.[leaf.style];
    assert.ok(fileName, `fonte desconhecida ${leaf.family}`);
    const charset = charsetOf(fileName);
    for (const ch of leaf.text) {
      const cp = ch.codePointAt(0);
      if (cp === 0x0a || cp === 0x20) continue;
      if (!charset.has(cp)) missing.set(ch, (missing.get(ch) ?? 0) + 1);
    }
  }
  return missing;
}

test("fontes: PDF_GLYPH_RANGES é exatamente a interseção dos cmap das seis fontes embutidas", () => {
  const names = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf", "DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf"];
  const sets = names.map((name) => new Set(fontkit.openSync(fontFile(name)).characterSet));
  // U+FFFF é um noncharacter que o subsetter mantém no cmap; não é glifo de texto.
  const shared = [...sets[0]].filter((cp) => cp !== 0xffff && sets.every((set) => set.has(cp)));
  const declared = new Set();
  for (const [from, to] of PDF_GLYPH_RANGES) for (let cp = from; cp <= to; cp++) declared.add(cp);
  const onlyInFonts = shared.filter((cp) => !declared.has(cp));
  const onlyDeclared = [...declared].filter((cp) => !shared.includes(cp));
  assert.deepEqual(onlyInFonts.map((cp) => cp.toString(16)), [], "fontes têm glifos que a tabela não declara");
  assert.deepEqual(onlyDeclared.map((cp) => cp.toString(16)), [], "tabela declara glifos que as fontes não têm");
});

test("fontes: a DejaVu Sans Mono cobre ASCII, box-drawing e setas usados em blocos de código", () => {
  const charset = new Set(fontkit.openSync(fontFile("DejaVuSansMono.ttf")).characterSet);
  for (let cp = 0x20; cp <= 0x7e; cp++) assert.ok(charset.has(cp), `mono sem ASCII U+${cp.toString(16)}`);
  for (let cp = 0x2500; cp <= 0x257f; cp++) assert.ok(charset.has(cp), `mono sem box-drawing U+${cp.toString(16)}`);
  for (let cp = 0x2190; cp <= 0x2199; cp++) assert.ok(charset.has(cp), `mono sem seta U+${cp.toString(16)}`);
});

test("glifos: o fixture inteiro só usa caracteres presentes nas fontes que o pdfmake recebe", () => {
  const file = fileFromBody({ name: "all-constructs.md", title: "Fixture", body: fs.readFileSync(fixturePath, "utf8") });
  const missing = assertGlyphsInFonts(file);
  assert.deepEqual([...missing.keys()], [], `sem glifo: ${JSON.stringify([...missing])}`);
});

test("glifos: todos os documentos visíveis do corpus real cabem nas fontes embutidas", (t) => {
  const corpus = buildVisibleCorpus();
  if (!corpus) {
    t.skip("base documental não encontrada (defina DIAGNOSTICO_SRC)");
    return;
  }
  const report = new Map();
  for (const file of corpus) {
    for (const [ch, count] of assertGlyphsInFonts(file)) report.set(ch, (report.get(ch) ?? 0) + count);
  }
  assert.deepEqual([...report.keys()], [], `caracteres sem glifo no corpus: ${JSON.stringify([...report])}`);
});

test("métricas: a largura medida de um texto bate com a soma dos avanços do fontkit", () => {
  for (const name of ["DejaVuSans-Bold.ttf", "DejaVuSansMono.ttf"]) {
    const bytes = new Uint8Array(fs.readFileSync(fontFile(name)));
    const measure = createEmMeasurer(bytes);
    const font = fontkit.create(Buffer.from(bytes));
    for (const sample of ["EV-198", "Caso observado", "Validação necessária", "ação ÇÃO →", "2026-09-23"]) {
      const expected = [...sample].reduce((sum, ch) => sum + font.glyphForCodePoint(ch.codePointAt(0)).advanceWidth, 0) / font.unitsPerEm;
      assert.ok(Math.abs(measure(sample) - expected) < 1e-9, `${name} "${sample}": ${measure(sample)} != ${expected}`);
    }
  }
});
