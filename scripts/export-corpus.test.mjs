import assert from "node:assert/strict";
import test from "node:test";
import { exportDocument } from "../src/lib/export/index.ts";
import {
  blocksText,
  buildVisibleCorpus,
  countBlocks,
  docxVisibleText,
  pdfText,
  readDocxParts,
  renderDocxForTest,
  renderPdfForTest,
  words,
} from "./export-harness.mjs";

const corpus = buildVisibleCorpus();
const DOCX_MIN_COVERAGE = 0.995;
const PDF_MIN_COVERAGE = 0.99;

function countLinks(blocks) {
  const inlineLinks = (nodes) =>
    nodes.reduce((count, node) => {
      if (node.type === "link") return count + 1 + inlineLinks(node.children);
      if (node.children) return count + inlineLinks(node.children);
      return count;
    }, 0);
  let count = 0;
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph") count += inlineLinks(block.children);
    if (block.type === "list") for (const item of block.items) count += countLinks(item.blocks);
    if (block.type === "quote") count += countLinks(block.blocks);
    if (block.type === "table") {
      for (const cell of [...block.head, ...block.rows.flat()]) count += inlineLinks(cell);
    }
  }
  return count;
}

function missingWords(expectedText, actualText) {
  const actual = words(actualText);
  const expected = [...words(expectedText)];
  const missing = expected.filter((word) => !actual.has(word));
  return { total: expected.length, missing };
}

test("corpus: a base documental visível foi encontrada e tem documentos", (t) => {
  if (!corpus) {
    t.skip("base documental não encontrada (defina DIAGNOSTICO_SRC ou mantenha a pasta ../SrJorge)");
    return;
  }
  assert.ok(corpus.length > 0);
  t.diagnostic(`documentos visíveis: ${corpus.length}`);
});

if (corpus) {
  for (const file of corpus) {
    test(`corpus: ${file.path} exporta em md, docx e pdf com integridade`, async () => {
      // Markdown: bytes idênticos ao corpo exibido.
      const md = await exportDocument("md", { file, editedBy: null, editedAt: null });
      assert.equal(Buffer.from(await md.blob.arrayBuffer()).toString("utf8"), file.body);

      // Word: pacote válido, texto completo, tabelas e links preservados.
      const { buffer: docx, doc } = await renderDocxForTest(file);
      const parts = await readDocxParts(docx);
      const docxText = docxVisibleText(parts["word/document.xml"]);
      const expectedText = blocksText(doc.blocks);
      const docxCoverage = missingWords(expectedText, docxText);
      assert.ok(
        1 - docxCoverage.missing.length / Math.max(docxCoverage.total, 1) >= DOCX_MIN_COVERAGE,
        `cobertura do docx abaixo do mínimo: ${docxCoverage.missing.slice(0, 20).join(", ")}`
      );
      assert.equal(
        (parts["word/document.xml"].match(/<w:tbl>/g) ?? []).length,
        countBlocks(doc.blocks, "table"),
        "número de tabelas diverge"
      );
      assert.equal(
        (parts["word/document.xml"].match(/<w:hyperlink /g) ?? []).length,
        countLinks(doc.blocks),
        "número de hiperlinks externos diverge"
      );

      // PDF: cabeçalho, rodapé, texto extraível e nenhum caractere substituído por "?".
      const { buffer: pdf, report } = await renderPdfForTest(file);
      assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
      assert.ok(pdf.subarray(-64).toString("latin1").includes("%%EOF"));
      const { numPages, text } = await pdfText(pdf);
      assert.ok(numPages >= 1);
      const pdfCoverage = missingWords(expectedText, text);
      assert.ok(
        1 - pdfCoverage.missing.length / Math.max(pdfCoverage.total, 1) >= PDF_MIN_COVERAGE,
        `cobertura do pdf abaixo do mínimo: ${pdfCoverage.missing.slice(0, 20).join(", ")}`
      );
      assert.equal(report.unsupported, 0, "caractere sem glifo chegou ao PDF");
      assert.ok(!text.includes("📘") && !text.includes("😍"), "emoji chegou ao PDF");

      // Metadados: o nome do arquivo segue o .md de origem.
      assert.equal(md.filename, `${file.name.replace(/\.md$/, "")}.md`);
    });
  }
}
