import { formatDate, formatDateTime } from "./meta.ts";
import { createSanitizeReport, sanitizeForPdf, type SanitizeReport } from "./sanitize.ts";
import { layoutColumns, minimumWidths } from "./table.ts";
import type { EmMeasurer } from "./fontMetrics.ts";
import type { Align, Block, ExportDocument, ExportMeta, Inline, ListItem } from "./types.ts";

/** Nome do arquivo de cada fonte no sistema virtual do pdfmake. */
export const PDF_FONT_NAMES = [
  "DejaVuSans.ttf",
  "DejaVuSans-Bold.ttf",
  "DejaVuSans-Oblique.ttf",
  "DejaVuSans-BoldOblique.ttf",
  "DejaVuSansMono.ttf",
  "DejaVuSansMono-Bold.ttf",
] as const;

export type PdfFontBytes = Record<string, Uint8Array>;

const SANS = "DejaVuSans";
const MONO = "DejaVuSansMono";
const PDF_FONTS = {
  [SANS]: {
    normal: "DejaVuSans.ttf",
    bold: "DejaVuSans-Bold.ttf",
    italics: "DejaVuSans-Oblique.ttf",
    bolditalics: "DejaVuSans-BoldOblique.ttf",
  },
  [MONO]: {
    normal: "DejaVuSansMono.ttf",
    bold: "DejaVuSansMono-Bold.ttf",
    italics: "DejaVuSansMono.ttf",
    bolditalics: "DejaVuSansMono-Bold.ttf",
  },
};

const INK = "#1B1B1B";
const CIANO = "#137A80";
const MUTED = "#6B6B6B";
const LINK = "#0B6E74";
const RULE = "#BDB6A5";
const CODE_FILL = "#F3F0E8";
const HEAD_FILL = "#E8E2D2";
const QUOTE_BAR = "#63BEC2";
const HEADING_SIZE = [17, 14, 12, 11, 10, 10];
/** Espaço horizontal dentro de cada célula de tabela (paddingLeft 4 + paddingRight 4). */
const CELL_PADDING = 8;
/** Borda vertical de tabela (vLineWidth), também somada pelo pdfmake a cada coluna. */
const TABLE_BORDER = 0.5;
/** Menor fonte de tabela aceita; abaixo disso a leitura não se sustenta. */
const MIN_TABLE_FONT_SIZE = 6;

// A4 em pontos: 595,28 de largura, margens de 56 pt nos dois lados.
const MARGIN = 56;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;

export type PdfNode = Record<string, unknown>;
export type PdfDefinition = PdfNode;

/** Subconjunto da API do pdfmake usada aqui; o objeto real vem de pdfmake/build/pdfmake ou de "pdfmake". */
export type PdfEngine = {
  virtualfs: { writeFileSync(name: string, data: Uint8Array): unknown };
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(policy: (url: string) => boolean): void;
  createPdf(definition: PdfDefinition): {
    getBlob?: () => Promise<Blob>;
    getBuffer?: () => Promise<Uint8Array>;
  };
};

/**
 * Monta a definição do pdfmake. `measure` devolve a largura em em de um texto na face mais larga
 * usada nas tabelas (negrito), para que nenhuma palavra do cabeçalho seja quebrada.
 */
export function buildPdfDefinition(
  doc: ExportDocument,
  meta: ExportMeta,
  measure: EmMeasurer
): { definition: PdfDefinition; report: SanitizeReport } {
  const report = createSanitizeReport();
  const text = (value: string) => sanitizeForPdf(value, report);

  const inlineRuns = (nodes: Inline[], style: PdfNode = {}): PdfNode[] =>
    nodes.flatMap((node): PdfNode[] => {
      switch (node.type) {
        case "text":
          return [{ ...style, text: text(node.value) }];
        case "code":
          return [{ ...style, text: text(node.value), font: MONO }];
        case "strong":
          return inlineRuns(node.children, { ...style, bold: true });
        case "emphasis":
          return inlineRuns(node.children, { ...style, italics: true });
        case "strike":
          return inlineRuns(node.children, { ...style, decoration: "lineThrough" });
        case "link":
          return inlineRuns(node.children, { ...style, link: node.href, color: LINK, decoration: "underline" });
        case "break":
          return [{ text: "\n" }];
      }
    });

  const textOf = (nodes: Inline[]): PdfNode[] | string => {
    const runs = inlineRuns(nodes);
    return runs.length > 0 ? runs : "";
  };

  const stackOf = (blocks: Block[]): PdfNode[] => (blocks.length > 0 ? blocks.map(block) : [{ text: "" }]);

  const block = (node: Block): PdfNode => {
    switch (node.type) {
      case "heading":
        return {
          text: textOf(node.children),
          bold: true,
          fontSize: HEADING_SIZE[Math.min(Math.max(node.level, 1), 6) - 1],
          color: node.level <= 1 ? INK : CIANO,
          margin: [0, node.level <= 1 ? 12 : 8, 0, 4],
        };
      case "paragraph":
        return { text: textOf(node.children), margin: [0, 0, 0, 6] };
      case "list": {
        const items = node.items.map((item) => ({ stack: stackOf(withCheckbox(item)) }));
        return node.ordered
          ? { ol: items, start: node.start, margin: [0, 0, 0, 6] }
          : { ul: items, margin: [0, 0, 0, 6] };
      }
      case "code":
        return codeBlock(node.value);
      case "quote":
        return {
          table: { widths: ["*"], body: [[{ stack: stackOf(node.blocks) }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
            vLineColor: () => QUOTE_BAR,
            paddingLeft: (i: number) => (i === 0 ? 10 : 0),
            paddingRight: () => 0,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
          margin: [0, 2, 0, 8],
        };
      case "table":
        return tableNode(node.align, node.head, node.rows);
      case "rule":
        return rule();
    }
  };

  const withCheckbox = (item: ListItem): Block[] => {
    if (item.checked === null) return item.blocks;
    const box: Inline = { type: "text", value: item.checked ? "☑ " : "☐ " };
    const [first, ...rest] = item.blocks;
    if (first?.type === "paragraph") return [{ ...first, children: [box, ...first.children] }, ...rest];
    return [{ type: "paragraph", children: [box] }, ...item.blocks];
  };

  const codeBlock = (value: string): PdfNode => {
    const lines = value.replace(/\t/g, "    ").split("\n");
    return {
      table: {
        widths: ["*"],
        body: lines.map((line) => [
          { text: text(line) || " ", font: MONO, fontSize: 8.5, preserveLeadingSpaces: true },
        ]),
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => CODE_FILL,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: (i: number) => (i === 0 ? 6 : 0),
        paddingBottom: (i: number, node: { table: { body: unknown[] } }) =>
          i === node.table.body.length - 1 ? 6 : 0,
      },
      margin: [0, 2, 0, 8],
    };
  };

  const tableNode = (align: Align[], head: Inline[][], rows: Inline[][][]): PdfNode => {
    const columns = Math.max(head.length, ...rows.map((row) => row.length));
    // O pdfmake soma o padding e a borda vertical de cada coluna à largura informada. Por isso cada
    // coluna reserva essa parcela dentro do total, e a largura enviada é a líquida.
    const perColumn = CELL_PADDING + TABLE_BORDER;
    const available = CONTENT_WIDTH - TABLE_BORDER;
    // A fonte encolhe até que a palavra mais larga de cada coluna caiba: pdfmake expande colunas
    // que não cabem, e a tabela sairia da margem.
    const fits = (size: number) => {
      const minimums = minimumWidths(head, rows, columns, (word) => measure(word) * size + perColumn);
      return minimums.reduce((acc, width) => acc + width, 0) <= available;
    };
    let size = columns > 5 ? 8 : 9;
    while (size > MIN_TABLE_FONT_SIZE && !fits(size)) size -= 0.5;
    const widths = layoutColumns(head, rows, columns, available, (word) => measure(word) * size + perColumn).map(
      (width) => width - perColumn
    );
    const cell = (content: Inline[], col: number, header: boolean): PdfNode => ({
      text: textOf(content),
      bold: header,
      alignment: align[col] ?? "left",
      fontSize: size,
    });
    return {
      table: {
        headerRows: 1,
        widths,
        body: [
          Array.from({ length: columns }, (_, col) => cell(head[col] ?? [], col, true)),
          ...rows.map((row) => Array.from({ length: columns }, (_, col) => cell(row[col] ?? [], col, false))),
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => TABLE_BORDER,
        hLineColor: () => RULE,
        vLineColor: () => RULE,
        fillColor: (row: number) => (row === 0 ? HEAD_FILL : null),
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 2, 0, 10],
    };
  };

  const rule = (): PdfNode => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.6, lineColor: RULE }],
    margin: [0, 6, 0, 8],
  });

  const titleNodes: PdfNode[] = [
    { text: text(doc.title), fontSize: 19, bold: true, color: INK, margin: [0, 0, 0, 4] },
    { text: text(`${meta.client} · ${meta.project}`), fontSize: 8.5, bold: true, color: CIANO, margin: [0, 0, 0, 2] },
    { text: text(meta.path), font: MONO, fontSize: 7.5, color: MUTED, margin: [0, 0, 0, 2] },
    ...(meta.status
      ? [{ text: text(meta.status), italics: true, fontSize: 9, color: "#444444", margin: [0, 0, 0, 2] }]
      : []),
    ...(meta.editedBy && meta.editedAt
      ? [
          {
            text: text(`Editado por ${meta.editedBy} em ${formatDateTime(meta.editedAt)}`),
            fontSize: 8,
            color: MUTED,
            margin: [0, 0, 0, 2],
          },
        ]
      : []),
    rule(),
  ];

  const definition: PdfDefinition = {
    pageSize: "A4",
    pageMargins: [MARGIN, 64, MARGIN, 60],
    info: {
      title: doc.title,
      author: meta.brand,
      subject: `${meta.client} · ${meta.project}`,
      creator: meta.brand,
      keywords: meta.path,
    },
    defaultStyle: { font: SANS, fontSize: 9.5, lineHeight: 1.25, color: INK },
    header: (): PdfNode => ({
      text: `${meta.client} · ${meta.project}`,
      alignment: "right",
      fontSize: 7.5,
      color: MUTED,
      margin: [MARGIN, 24, MARGIN, 0],
    }),
    footer: (current: number, total: number): PdfNode => ({
      columns: [
        { text: `${meta.brand} · exportado em ${formatDate(meta.exportedAt)}`, fontSize: 7.5, color: MUTED },
        { text: `Página ${current} de ${total}`, alignment: "right", fontSize: 7.5, color: MUTED },
      ],
      margin: [MARGIN, 20, MARGIN, 0],
    }),
    content: [...titleNodes, ...doc.blocks.map(block)],
  };

  return { definition, report };
}

/**
 * Registra as fontes no pdfmake e gera o PDF. Funciona no navegador (getBlob)
 * e no Node usado pelos testes (getBuffer).
 */
export async function renderPdf(engine: PdfEngine, definition: PdfDefinition, fonts: PdfFontBytes): Promise<Blob> {
  for (const name of PDF_FONT_NAMES) {
    const bytes = fonts[name];
    if (!bytes) throw new Error(`Fonte ausente para o PDF: ${name}`);
    engine.virtualfs.writeFileSync(name, bytes);
  }
  engine.addFonts(PDF_FONTS);
  engine.setUrlAccessPolicy(() => false);

  const pdf = engine.createPdf(definition);
  if (pdf.getBlob) return pdf.getBlob();
  if (pdf.getBuffer) return new Blob([new Uint8Array(await pdf.getBuffer())], { type: "application/pdf" });
  throw new Error("pdfmake não expõe a saída do PDF");
}
