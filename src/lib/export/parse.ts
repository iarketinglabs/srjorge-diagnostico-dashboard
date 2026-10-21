import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/** Nó mdast genérico: só os campos que o export lê. */
export type MdNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  url?: string;
  alt?: string | null;
  align?: (string | null)[] | null;
  identifier?: string;
  label?: string | null;
  children?: MdNode[];
};

export function parseMarkdown(source: string): MdNode {
  // Arquivos salvos no Windows podem vir com CRLF; o parser trabalha só com LF.
  return unified().use(remarkParse).use(remarkGfm).parse(source.replace(/\r\n?/g, "\n"));
}
