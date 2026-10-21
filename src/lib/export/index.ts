import { exportFileName } from "./filename.ts";
import { buildMeta } from "./meta.ts";
import { buildMarkdownBlob } from "./toMarkdown.ts";
import type { ExportInput, ExportKind, ExportResult } from "./types.ts";
import type { SanitizeReport } from "./sanitize.ts";

export type { ExportInput, ExportKind, ExportResult } from "./types.ts";

/**
 * Gera o arquivo do documento aberto. Docx e PDF carregam seus módulos e fontes
 * só nesta chamada, então o painel não paga o peso deles até o primeiro export.
 */
export async function exportDocument(kind: ExportKind, input: ExportInput): Promise<ExportResult> {
  const filename = exportFileName(input.file.name, kind);
  if (kind === "md") {
    return { blob: buildMarkdownBlob(input.file.body), filename, warnings: [] };
  }

  const meta = buildMeta(input);
  const { prepareDocument } = await import("./document.ts");
  const doc = prepareDocument(input.file);

  if (kind === "docx") {
    const { buildDocx } = await import("./toDocx.ts");
    return { blob: await buildDocx(doc, meta), filename, warnings: [] };
  }

  const [{ buildPdfDefinition, renderPdf }, { loadPdfFonts }, { loadPdfEngine }, { createEmMeasurer }] = await Promise.all([
    import("./toPdf.ts"),
    import("./fonts.ts"),
    import("./engine.ts"),
    import("./fontMetrics.ts"),
  ]);
  const [engine, fonts] = await Promise.all([loadPdfEngine(), loadPdfFonts()]);
  const { definition, report } = buildPdfDefinition(doc, meta, createEmMeasurer(fonts["DejaVuSans-Bold.ttf"]));
  const blob = await renderPdf(engine, definition, fonts);
  return { blob, filename, warnings: pdfWarnings(report) };
}

function pdfWarnings(report: SanitizeReport): string[] {
  const warnings: string[] = [];
  if (report.emoji > 0) warnings.push(`${report.emoji} emoji removido(s) do PDF (o Word mantém).`);
  if (report.unsupported > 0) warnings.push(`${report.unsupported} caractere(s) sem glifo substituído(s) por "?" no PDF.`);
  return warnings;
}
