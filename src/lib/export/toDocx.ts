import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type INumberingOptions,
} from "docx";
import { formatDate, formatDateTime } from "./meta.ts";
import { sanitizeForDocx } from "./sanitize.ts";
import { layoutColumns } from "./table.ts";
import type { Align, Block, ExportDocument, ExportMeta, Inline, ListItem } from "./types.ts";

// A4 com margens de 2 cm, em twips (1/1440 pol.).
const PAGE_WIDTH = 11906;
const PAGE_MARGIN = 1134;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LIST_STEP = 360;
const QUOTE_STEP = 240;

const FONT_TEXT = "Calibri";
const FONT_MONO = "Consolas";
const COLOR = {
  ink: "1B1B1B",
  ciano: "137A80",
  muted: "6B6B6B",
  link: "0B6E74",
  rule: "BDB6A5",
  codeFill: "F3F0E8",
  headFill: "E8E2D2",
  quoteBar: "63BEC2",
} as const;
const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];
const HEADING_HALF_POINTS = [36, 30, 26, 24, 22, 22];

type Run = TextRun | ExternalHyperlink;
type Style = { bold?: boolean; italics?: boolean; strike?: boolean; color?: string; font?: string; size?: number; underline?: boolean };
type NumberingConfig = NonNullable<INumberingOptions["config"]>[number];
type Ctx = {
  /** Recuo esquerdo (twips) do conteúdo corrente. */
  left: number;
  quoted: boolean;
  numbering: NumberingConfig[];
};

export async function buildDocx(doc: ExportDocument, meta: ExportMeta): Promise<Blob> {
  const numbering: NumberingConfig[] = [];
  const ctx: Ctx = { left: 0, quoted: false, numbering };
  const body = [...titleBlock(doc.title, meta), ...renderBlocks(doc.blocks, ctx)];

  const footerDate = formatDate(meta.exportedAt);
  const document = new Document({
    creator: meta.brand,
    title: doc.title,
    subject: `${meta.client} · ${meta.project}`,
    description: meta.path,
    styles: { default: { document: { run: { font: FONT_TEXT, size: 21, color: COLOR.ink } } } },
    numbering: { config: numbering },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: 16838 },
            margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, header: 567, footer: 567 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${meta.client} · ${meta.project}`, size: 16, color: COLOR.muted })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [`${meta.brand} · exportado em ${footerDate} · Página `, PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: COLOR.muted,
                  }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });

  return Packer.toBlob(document);
}

function titleBlock(title: string, meta: ExportMeta): Paragraph[] {
  const lines: Paragraph[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: sanitizeForDocx(title), bold: true, size: 40, color: COLOR.ink })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `${meta.client} · ${meta.project}`, bold: true, size: 18, color: COLOR.ciano })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: meta.path, font: FONT_MONO, size: 16, color: COLOR.muted })],
    }),
  ];
  if (meta.status) {
    lines.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: sanitizeForDocx(meta.status), italics: true, size: 20, color: "444444" })],
      })
    );
  }
  if (meta.editedBy && meta.editedAt) {
    lines.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: `Editado por ${meta.editedBy} em ${formatDateTime(meta.editedAt)}`,
            size: 16,
            color: COLOR.muted,
          }),
        ],
      })
    );
  }
  lines.push(rule());
  return lines;
}

function renderBlocks(blocks: Block[], ctx: Ctx): (Paragraph | Table)[] {
  return blocks.flatMap((block) => renderBlock(block, ctx));
}

function renderBlock(block: Block, ctx: Ctx): (Paragraph | Table)[] {
  switch (block.type) {
    case "heading": {
      const index = Math.min(Math.max(block.level, 1), 6) - 1;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[index],
          keepNext: true,
          spacing: { before: index === 0 ? 280 : 200, after: 100 },
          indent: indent(ctx),
          border: quoteBorder(ctx),
          children: runs(block.children, {
            bold: true,
            color: index === 0 ? COLOR.ink : COLOR.ciano,
            size: HEADING_HALF_POINTS[index],
          }),
        }),
      ];
    }
    case "paragraph":
      return [
        new Paragraph({
          spacing: { after: 120, line: 300 },
          indent: indent(ctx),
          border: quoteBorder(ctx),
          children: runs(block.children),
        }),
      ];
    case "list":
      return renderList(block.ordered, block.start, block.items, ctx);
    case "code":
      return renderCode(block.value, ctx);
    case "quote":
      return renderBlocks(block.blocks, { ...ctx, left: ctx.left + QUOTE_STEP, quoted: true });
    case "table":
      return [renderTable(block.align, block.head, block.rows, ctx)];
    case "rule":
      return [rule()];
  }
}

function renderList(ordered: boolean, start: number, items: ListItem[], ctx: Ctx): (Paragraph | Table)[] {
  const reference = `list-${ctx.numbering.length}`;
  const textLeft = ctx.left + LIST_STEP;
  ctx.numbering.push({
    reference,
    levels: [
      {
        level: 0,
        format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
        text: ordered ? "%1." : "•",
        start: ordered ? start : undefined,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: textLeft, hanging: LIST_STEP } } },
      },
    ],
  });

  const itemCtx: Ctx = { ...ctx, left: textLeft };
  return items.flatMap((item) => {
    const [first, ...rest] = item.blocks;
    const out: (Paragraph | Table)[] = [];
    if (first?.type === "paragraph" || first?.type === "heading") {
      out.push(
        new Paragraph({
          numbering: { reference, level: 0 },
          spacing: { after: 60, line: 300 },
          children: [
            ...checkbox(item.checked),
            ...runs(first.children, first.type === "heading" ? { bold: true } : {}),
          ],
        })
      );
    } else {
      out.push(new Paragraph({ numbering: { reference, level: 0 }, spacing: { after: 60 }, children: checkbox(item.checked) }));
      if (first) out.push(...renderBlock(first, itemCtx));
    }
    out.push(...renderBlocks(rest, itemCtx));
    return out;
  });
}

function renderCode(value: string, ctx: Ctx): Paragraph[] {
  const lines = value.replace(/\t/g, "    ").split("\n");
  return lines.map(
    (line, i) =>
      new Paragraph({
        shading: { type: ShadingType.CLEAR, color: "auto", fill: COLOR.codeFill },
        spacing: { before: 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
        indent: { left: ctx.left + 120 },
        keepLines: true,
        children: [
          new TextRun({
            text: sanitizeForDocx(line) || " ",
            font: FONT_MONO,
            size: 17,
          }),
        ],
      })
  );
}

function renderTable(align: Align[], head: Inline[][], rows: Inline[][][], ctx: Ctx): Table {
  const columns = Math.max(head.length, ...rows.map((row) => row.length));
  const total = CONTENT_WIDTH - ctx.left;
  const cellSize = columns > 5 ? 16 : 18;
  // Sem fonte embutida no .docx a largura é estimada: ~0,6 em por caractere (tamanho em meio-pontos → twips).
  // Margens internas da célula: 100 + 100.
  const widths = integerWidths(layoutColumns(head, rows, columns, total, (word) => word.length * 6 * cellSize + 200), total);
  const cell = (content: Inline[], col: number, style: Style) =>
    new TableCell({
      width: { size: widths[col], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      shading: style.bold ? { type: ShadingType.CLEAR, color: "auto", fill: COLOR.headFill } : undefined,
      children: [
        new Paragraph({
          alignment: alignmentOf(align[col]),
          spacing: { after: 0, line: 252 },
          children: runs(content, { ...style, size: cellSize }),
        }),
      ],
    });

  const headRow = new TableRow({
    tableHeader: true,
    children: Array.from({ length: columns }, (_, col) => cell(head[col] ?? [], col, { bold: true })),
  });
  const bodyRows = rows.map(
    (row) =>
      new TableRow({
        children: Array.from({ length: columns }, (_, col) => cell(row[col] ?? [], col, {})),
      })
  );

  return new Table({
    width: { size: CONTENT_WIDTH - ctx.left, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    indent: { size: ctx.left, type: WidthType.DXA },
    rows: [headRow, ...bodyRows],
  });
}

/** Larguras inteiras em twips que somam exatamente o total. */
function integerWidths(values: number[], total: number): number[] {
  const widths = values.map((value) => Math.floor(value));
  if (widths.length > 0) widths[widths.length - 1] += total - widths.reduce((acc, width) => acc + width, 0);
  return widths;
}

function runs(nodes: Inline[], style: Style = {}): Run[] {
  return nodes.flatMap((node): Run[] => {
    switch (node.type) {
      case "text":
        return [new TextRun({ text: sanitizeForDocx(node.value), ...textStyle(style) })];
      case "code":
        return [new TextRun({ text: sanitizeForDocx(node.value), ...textStyle({ ...style, font: FONT_MONO }) })];
      case "strong":
        return runs(node.children, { ...style, bold: true });
      case "emphasis":
        return runs(node.children, { ...style, italics: true });
      case "strike":
        return runs(node.children, { ...style, strike: true });
      case "link":
        return [
          new ExternalHyperlink({
            link: node.href,
            children: linkRuns(node.children, { ...style, color: COLOR.link, underline: true }),
          }),
        ];
      case "break":
        return [new TextRun({ break: 1 })];
    }
  });
}

/** Texto dentro de hiperlink: o Word só aceita TextRun como filho direto. */
function linkRuns(nodes: Inline[], style: Style): TextRun[] {
  return runs(nodes, style).filter((run): run is TextRun => run instanceof TextRun);
}

function textStyle(style: Style) {
  return {
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    color: style.color,
    font: style.font,
    size: style.size,
    underline: style.underline ? { type: UnderlineType.SINGLE, color: style.color } : undefined,
  };
}

function checkbox(checked: boolean | null): TextRun[] {
  if (checked === null) return [];
  return [new TextRun({ text: checked ? "☑ " : "☐ ", font: "Segoe UI Symbol" })];
}

function indent(ctx: Ctx) {
  return ctx.left > 0 ? { left: ctx.left } : undefined;
}

function quoteBorder(ctx: Ctx) {
  return ctx.quoted
    ? { left: { style: BorderStyle.SINGLE, size: 18, color: COLOR.quoteBar, space: 10 } }
    : undefined;
}

function alignmentOf(align: Align | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "center") return AlignmentType.CENTER;
  return AlignmentType.LEFT;
}

function rule(): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.rule, space: 1 } },
    children: [],
  });
}
