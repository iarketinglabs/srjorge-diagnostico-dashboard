import type { ExportKind } from "./types.ts";

const EXTENSION: Record<ExportKind, string> = { docx: "docx", pdf: "pdf", md: "md" };

/** Nome do arquivo baixado: o mesmo nome do .md de origem, com a extensão do formato. */
export function exportFileName(sourceName: string, kind: ExportKind): string {
  const base = sourceName
    .replace(/\.md$/i, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return `${base || "documento"}.${EXTENSION[kind]}`;
}
