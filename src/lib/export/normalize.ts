import type { MdNode } from "./parse.ts";
import type { Align, Block, Inline, ListItem } from "./types.ts";

const EXTERNAL_URL = /^(https?:|mailto:)/i;

/**
 * Converte o mdast em blocos neutros para os exportadores.
 * Links que não são externos (referências entre documentos, caminhos relativos)
 * viram só o texto do link: o destino não existe fora do painel.
 * HTML não é exportado: comentários (ex.: notas do apresentador) e tags somem,
 * como no painel. Código entre crases continua literal.
 */
export function normalizeMarkdown(root: MdNode): Block[] {
  const definitions = new Map<string, string>();
  collectDefinitions(root, definitions);

  const inline = (node: MdNode): Inline[] => {
    switch (node.type) {
      case "text":
        return [{ type: "text", value: node.value ?? "" }];
      case "inlineCode":
        return [{ type: "code", value: node.value ?? "" }];
      case "strong":
        return [{ type: "strong", children: inlines(node.children) }];
      case "emphasis":
        return [{ type: "emphasis", children: inlines(node.children) }];
      case "delete":
        return [{ type: "strike", children: inlines(node.children) }];
      case "break":
        return [{ type: "break" }];
      case "link":
        return withLink(node.url ?? "", inlines(node.children));
      case "linkReference":
        return withLink(definitions.get(node.identifier ?? "") ?? "", inlines(node.children));
      case "image":
      case "imageReference":
        return [{ type: "text", value: node.alt ?? node.url ?? "" }];
      case "footnoteReference":
        return [{ type: "text", value: `[^${node.label ?? node.identifier ?? ""}]` }];
      case "html":
        // Tags e comentários HTML não aparecem no painel; o texto ao redor continua como nó de texto.
        return [];
      default:
        if (node.children) return inlines(node.children);
        return node.value ? [{ type: "text", value: node.value }] : [];
    }
  };

  const inlines = (nodes: MdNode[] = []): Inline[] => nodes.flatMap(inline);

  const listItem = (node: MdNode): ListItem => ({
    checked: node.checked ?? null,
    blocks: blocks(node.children ?? []),
  });

  const table = (node: MdNode): Block => {
    const [head, ...body] = node.children ?? [];
    return {
      type: "table",
      align: (node.align ?? []).map(toAlign),
      head: cells(head),
      rows: body.map(cells),
    };
  };

  const cells = (row?: MdNode): Inline[][] => (row?.children ?? []).map((cell) => inlines(cell.children));

  const block = (node: MdNode): Block[] => {
    switch (node.type) {
      case "heading":
        return [{ type: "heading", level: node.depth ?? 1, children: inlines(node.children) }];
      case "paragraph":
        return [{ type: "paragraph", children: inlines(node.children) }];
      case "list":
        return [
          {
            type: "list",
            ordered: node.ordered === true,
            start: node.start ?? 1,
            items: (node.children ?? []).map(listItem),
          },
        ];
      case "code":
        return [{ type: "code", lang: node.lang ?? null, value: node.value ?? "" }];
      case "blockquote":
        return [{ type: "quote", blocks: blocks(node.children ?? []) }];
      case "table":
        return [table(node)];
      case "thematicBreak":
        return [{ type: "rule" }];
      case "html": {
        const text = stripHtml(node.value ?? "");
        return text ? [{ type: "paragraph", children: [{ type: "text", value: text }] }] : [];
      }
      case "footnoteDefinition":
        return blocks(node.children ?? []);
      case "definition":
        return [];
      default:
        if (node.children) return [{ type: "paragraph", children: inlines(node.children) }];
        return node.value ? [{ type: "paragraph", children: [{ type: "text", value: node.value }] }] : [];
    }
  };

  const blocks = (nodes: MdNode[]): Block[] => nodes.flatMap(block);

  return blocks(root.children ?? []);
}

/** Texto puro de uma sequência de inlines, sem marcações. */
export function plainText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        case "break":
          return " ";
        default:
          return plainText(node.children);
      }
    })
    .join("");
}

function stripHtml(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?[a-zA-Z][^>]*>/g, "").trim();
}

function withLink(href: string, children: Inline[]): Inline[] {
  return EXTERNAL_URL.test(href) ? [{ type: "link", href, children }] : children;
}

function toAlign(value: string | null | undefined): Align {
  return value === "left" || value === "right" || value === "center" ? value : null;
}

function collectDefinitions(node: MdNode, out: Map<string, string>): void {
  if (node.type === "definition" && node.identifier && node.url) {
    out.set(node.identifier, node.url);
  }
  for (const child of node.children ?? []) collectDefinitions(child, out);
}
