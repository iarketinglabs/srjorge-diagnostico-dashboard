import { normalizeMarkdown, plainText } from "./normalize.ts";
import { parseMarkdown } from "./parse.ts";
import type { ExportableFile, ExportDocument } from "./types.ts";

/**
 * Markdown do documento como blocos neutros. O título do cabeçalho do PDF/Word
 * já é o H1 do arquivo, então o H1 repetido no corpo sai para não duplicar.
 */
export function prepareDocument(file: ExportableFile): ExportDocument {
  const blocks = normalizeMarkdown(parseMarkdown(file.body));
  const [first, ...rest] = blocks;
  const repeatsTitle =
    first?.type === "heading" && first.level === 1 && plainText(first.children).trim() === file.title.trim();
  return { title: file.title, blocks: repeatsTitle ? rest : blocks };
}
