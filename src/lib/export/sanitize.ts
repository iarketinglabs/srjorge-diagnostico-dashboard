import { isPdfGlyph } from "./glyphs.ts";

export type SanitizeReport = { emoji: number; unsupported: number };

export function createSanitizeReport(): SanitizeReport {
  return { emoji: 0, unsupported: 0 };
}

const SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  ["⟦", "[["],
  ["⟧", "]]"],
  ["➔", "→"],
  ["℠", "SM"],
  ["\t", "    "],
];

const PICTOGRAPH = /\p{Extended_Pictographic}|‍|️/u;

function substitute(text: string): string {
  return SUBSTITUTIONS.reduce((acc, [from, to]) => acc.replaceAll(from, to), text.normalize("NFC"));
}

/** Word renderiza emoji por fallback de fonte, então o .docx mantém o texto como está. */
export function sanitizeForDocx(text: string): string {
  return substitute(text);
}

/**
 * Garante que nenhum caractere chegue ao PDF sem glifo nos subsets embutidos.
 * Emoji são removidos e contados; qualquer outro caractere fora dos subsets vira "?" e também é contado.
 */
export function sanitizeForPdf(text: string, report: SanitizeReport): string {
  let out = "";
  for (const ch of substitute(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\r") {
      continue;
    } else if (ch === "\n") {
      out += ch;
    } else if (isPdfGlyph(cp)) {
      out += ch;
    } else if (PICTOGRAPH.test(ch)) {
      report.emoji++;
    } else {
      report.unsupported++;
      out += "?";
    }
  }
  return out;
}
