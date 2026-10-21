import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { exportDocument } from "../src/lib/export/index.ts";
import { exportFileName } from "../src/lib/export/filename.ts";
import { isPdfGlyph, PDF_GLYPH_RANGES } from "../src/lib/export/glyphs.ts";
import { normalizeMarkdown } from "../src/lib/export/normalize.ts";
import { parseMarkdown } from "../src/lib/export/parse.ts";
import { createSanitizeReport, sanitizeForDocx, sanitizeForPdf } from "../src/lib/export/sanitize.ts";
import { columnFractions } from "../src/lib/export/table.ts";
import { buildPdfDefinition } from "../src/lib/export/toPdf.ts";
import {
  blocksText,
  boldMeasurer,
  countBlocks,
  documentFor,
  docxParser,
  docxVisibleText,
  fileFromBody,
  fixturePath,
  pdfText,
  readDocxParts,
  renderDocxForTest,
  renderPdfForTest,
  words,
} from "./export-harness.mjs";

const fixtureBody = fs.readFileSync(fixturePath, "utf8");
const fixtureFile = fileFromBody({
  name: "all-constructs.md",
  title: "Documento de teste das construções",
  status: "pendente",
  body: fixtureBody,
});

const EXTERNAL_LINKS = 2; // "link externo" e a referência [referência][ref]; o link para outro doc vira texto.

test("md: exporta o corpo exato do documento, em UTF-8, sem alterações", async () => {
  const result = await exportDocument("md", { file: fixtureFile, editedBy: null, editedAt: null });
  const bytes = Buffer.from(await result.blob.arrayBuffer());
  assert.equal(result.filename, "all-constructs.md");
  assert.equal(bytes.toString("utf8"), fixtureBody);
  assert.equal(result.blob.type, "text/markdown;charset=utf-8");
  assert.deepEqual(result.warnings, []);
});

test("md: preserva CRLF do arquivo de origem em vez de reescrever o texto", async () => {
  const body = "# Título\r\n\r\nTexto com acento: ação.\r\n";
  const result = await exportDocument("md", {
    file: fileFromBody({ name: "crlf.md", title: "Título", body }),
    editedBy: null,
    editedAt: null,
  });
  assert.equal(Buffer.from(await result.blob.arrayBuffer()).toString("utf8"), body);
});

test("nome do arquivo: mantém acentos, troca caracteres inválidos no Windows e usa a extensão do formato", () => {
  assert.equal(exportFileName("matriz-evidencias.md", "docx"), "matriz-evidencias.docx");
  assert.equal(exportFileName("plano-ação: versão 2?.md", "pdf"), "plano-ação- versão 2-.pdf");
  assert.equal(exportFileName("nome final. .md", "md"), "nome final.md");
  assert.equal(exportFileName(".md", "pdf"), "documento.pdf");
});

test("docx: pacote OOXML válido, todas as partes bem-formadas e texto completo", async () => {
  const { buffer } = await renderDocxForTest(fixtureFile);
  const parts = await readDocxParts(buffer);
  for (const required of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "docProps/core.xml"]) {
    assert.ok(parts[required] !== undefined, `parte ausente: ${required}`);
  }
  assert.ok(Object.keys(parts).some((name) => /^word\/footer\d*\.xml$/.test(name)), "rodapé ausente");
  assert.ok(Object.keys(parts).some((name) => /^word\/header\d*\.xml$/.test(name)), "cabeçalho ausente");

  const documentXml = parts["word/document.xml"];
  const visible = docxVisibleText(documentXml);
  const { doc } = documentFor(fixtureFile);
  const expected = words(blocksText(doc.blocks));
  const present = words(visible);
  const missing = [...expected].filter((word) => !present.has(word));
  assert.deepEqual(missing, [], "palavras do markdown ausentes no .docx");
});

test("docx: tabelas, hiperlinks externos, cabeçalho repetido e listas batem com a origem", async () => {
  const { buffer, doc } = await renderDocxForTest(fixtureFile);
  const documentXml = (await readDocxParts(buffer))["word/document.xml"];
  const sourceTables = countBlocks(doc.blocks, "table");
  assert.equal((documentXml.match(/<w:tbl>/g) ?? []).length, sourceTables);
  assert.equal((documentXml.match(/<w:hyperlink /g) ?? []).length, EXTERNAL_LINKS);
  assert.ok(documentXml.includes("<w:tblHeader"), "cabeçalho de tabela não marcado como repetível");
  assert.ok(documentXml.includes("link externo"));
  assert.ok(documentXml.includes("Consolas"), "código sem fonte monoespaçada");
});

test("docx: cada lista ordenada usa numeração própria, para que começar em 3 seja preservado", async () => {
  const { buffer } = await renderDocxForTest(fixtureFile);
  const numbering = (await readDocxParts(buffer))["word/numbering.xml"];
  assert.ok(numbering.includes('w:start w:val="3"'), "lista que começa em 3 perdeu o número inicial");
});

test("pdf: cabeçalho %PDF, rodapé %%EOF e texto extraível com todas as palavras", async () => {
  const { buffer } = await renderPdfForTest(fixtureFile);
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(buffer.subarray(-64).toString("latin1").includes("%%EOF"));

  const { numPages, text } = await pdfText(buffer);
  assert.ok(numPages >= 1);
  const { doc } = documentFor(fixtureFile);
  const missing = [...words(blocksText(doc.blocks))].filter((word) => !words(text).has(word));
  assert.deepEqual(missing, [], "palavras do markdown ausentes no PDF");
  assert.ok(text.includes("Página 1 de"), "numeração de página ausente");
  assert.ok(!text.includes("Editado por"), "sem edição, não deve haver linha de edição");
});

test("pdf: emoji são removidos e contados; símbolos suportados permanecem", async () => {
  const { buffer, report } = await renderPdfForTest(fixtureFile);
  assert.equal(report.emoji, 2, "esperado 📘 e 😍 no fixture");
  assert.equal(report.unsupported, 0);
  const { text } = await pdfText(buffer);
  assert.ok(!text.includes("📘") && !text.includes("😍"));
  for (const symbol of ["→", "←", "↔", "≈", "≠", "≤", "≥", "−", "■", "▼", "►", "☑", "☐", "✓", "ã", "Ç"]) {
    assert.ok(text.includes(symbol), `símbolo ausente no PDF: ${symbol}`);
  }
});

test("pdf: trechos de código preservam a árvore box-drawing e a indentação", async () => {
  const { buffer } = await renderPdfForTest(fixtureFile);
  const { text } = await pdfText(buffer);
  assert.ok(text.includes("├── AIOS/"));
  assert.ok(text.includes("└── Entregaveis/"));
  assert.ok(text.includes("indentado com tabulação"), "linha com tabulação sumiu do bloco de código");
});

test("pdf: tabela longa repete o cabeçalho em cada página", async () => {
  const rows = Array.from({ length: 140 }, (_, i) => `| Linha ${i + 1} | valor ${i + 1} |`).join("\n");
  const body = `# Tabela longa\n\n| Identificador | Descrição |\n| --- | --- |\n${rows}\n`;
  const { buffer } = await renderPdfForTest(fileFromBody({ name: "longa.md", title: "Tabela longa", body }));
  const { numPages, pages } = await pdfText(buffer);
  assert.ok(numPages >= 2, `esperava mais de uma página, veio ${numPages}`);
  for (const [index, page] of pages.entries()) {
    assert.ok(page.includes("Identificador"), `cabeçalho ausente na página ${index + 1}`);
  }
});

test("pdf: bloco de código longo continua em outra página sem perder linhas", async () => {
  const lines = Array.from({ length: 150 }, (_, i) => `linha-de-codigo-${i + 1}`).join("\n");
  const body = `# Código longo\n\n\`\`\`\n${lines}\n\`\`\`\n`;
  const { buffer } = await renderPdfForTest(fileFromBody({ name: "codigo.md", title: "Código longo", body }));
  const { numPages, text } = await pdfText(buffer);
  assert.ok(numPages >= 2);
  for (let i = 1; i <= 150; i++) assert.ok(text.includes(`linha-de-codigo-${i}`), `linha ${i} ausente`);
});

test("pdf: o H1 do corpo não é repetido quando já está no cabeçalho do documento", () => {
  const { doc } = documentFor(fixtureFile);
  assert.ok(!(doc.blocks[0]?.type === "heading" && doc.blocks[0].level === 1), "H1 repetido no corpo");
});

test("normalize: links externos são preservados, links internos viram texto, HTML some", () => {
  const blocks = normalizeMarkdown(
    parseMarkdown(
      "Veja [site](https://exemplo.com) e [matriz](matriz-evidencias.md) e [ref][r].\n\nTexto<!-- oculto --> depois\n\n[r]: https://exemplo.com/ref\n"
    )
  );
  const [paragraph, html] = blocks;
  assert.equal(paragraph.type, "paragraph");
  const links = paragraph.children.filter((node) => node.type === "link").map((node) => node.href);
  assert.deepEqual(links, ["https://exemplo.com", "https://exemplo.com/ref"]);
  assert.ok(!JSON.stringify(blocks).includes("oculto"), "comentário HTML vazou");
  assert.equal(html.type, "paragraph");
});

test("normalize: comentários HTML de bloco (notas do apresentador) não geram parágrafos", () => {
  const blocks = normalizeMarkdown(parseMarkdown("<!-- Notas: 4 min -->\n\nConteúdo visível\n"));
  assert.deepEqual(blocks.map((block) => block.type), ["paragraph"]);
});

test("normalize: tarefas, listas ordenadas e citações aninhadas", () => {
  const blocks = normalizeMarkdown(
    parseMarkdown("- [x] feito\n- [ ] pendente\n\n3. terceiro\n4. quarto\n\n> citação\n> > aninhada\n")
  );
  const [tasks, ordered, quote] = blocks;
  assert.deepEqual(tasks.items.map((item) => item.checked), [true, false]);
  assert.equal(ordered.ordered, true);
  assert.equal(ordered.start, 3);
  assert.equal(quote.type, "quote");
  assert.equal(quote.blocks.at(-1).type, "quote");
});

test("normalize: linha de referência de tabela de alinhamento e células vazias", () => {
  const blocks = normalizeMarkdown(parseMarkdown("| a | b | c |\n| :-- | :-: | --: |\n| 1 | | 3 |\n"));
  const [table] = blocks;
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.equal(table.rows[0][1].length, 0);
});

test("sanitize: mapeia ⟦⟧ e ➔, remove emoji e \\r, mantém ©®™ e acentos (NFC)", () => {
  const report = createSanitizeReport();
  assert.equal(sanitizeForPdf("⟦ETAPA 2⟧ A ➔ B", report), "[[ETAPA 2]] A → B");
  assert.equal(sanitizeForPdf("ok 📘 fim", report), "ok  fim");
  assert.equal(sanitizeForPdf("linha\r\nnova", report), "linha\nnova");
  assert.equal(sanitizeForPdf("© ® ™ ✓", report), "© ® ™ ✓");
  assert.equal(sanitizeForPdf("áo", report), "á" + "o");
  assert.equal(report.emoji, 1);
  assert.equal(report.unsupported, 0);
  assert.equal(sanitizeForDocx("⟦X⟧ 📘"), "[[X]] 📘", "Word mantém emoji");
});

test("sanitize: caractere fora dos subsets vira ? e é contado", () => {
  const report = createSanitizeReport();
  assert.equal(sanitizeForPdf("x ⌘ y", report), "x ? y");
  assert.equal(report.unsupported, 1);
});

test("glifos: a lista de faixas cobre os caracteres de teste e exclui caracteres fora dela", () => {
  assert.ok(isPdfGlyph("é".codePointAt(0)));
  assert.ok(isPdfGlyph("─".codePointAt(0)));
  assert.ok(!isPdfGlyph("📘".codePointAt(0)));
  assert.ok(PDF_GLYPH_RANGES.length > 0);
});

test("tabelas: proporções somam 1 e colunas longas ganham mais espaço", () => {
  const fractions = columnFractions([[{ type: "text", value: "a" }], [{ type: "text", value: "descrição longa" }]], [], 2);
  assert.equal(Math.round(fractions.reduce((a, b) => a + b, 0) * 1000) / 1000, 1);
  assert.ok(fractions[1] > fractions[0]);
});

test("meta: status não é repetido quando o corpo já traz '**Status:**'", () => {
  const { meta } = documentFor(
    fileFromBody({ name: "a.md", title: "A", status: "Em validação", body: "# A\n\n**Status:** Em validação\n" })
  );
  assert.equal(meta.status, null);
  const { meta: plain } = documentFor(fileFromBody({ name: "b.md", title: "B", status: "Rascunho", body: "# B\n" }));
  assert.equal(plain.status, "Rascunho");
});

test("pdf: definição usa só as fontes registradas e rodapé com paginação", () => {
  const { doc, meta } = documentFor(fixtureFile);
  const { definition } = buildPdfDefinition(doc, meta, boldMeasurer());
  assert.equal(typeof definition.footer, "function");
  const footer = definition.footer(2, 5);
  assert.ok(JSON.stringify(footer).includes("Página 2 de 5"));
});

test("docx e pdf: o texto do fixture não fica vazio e os dois formatos passam nos testes de sanidade", async () => {
  const { buffer: docx } = await renderDocxForTest(fixtureFile);
  const { buffer: pdf } = await renderPdfForTest(fixtureFile);
  assert.ok(docx.length > 4000);
  assert.ok(pdf.length > 4000);
  const zipEntries = await readDocxParts(docx);
  assert.ok(docxParser().parse(zipEntries["word/document.xml"]));
});
