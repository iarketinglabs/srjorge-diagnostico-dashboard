export type ExportKind = "docx" | "pdf" | "md";

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "emphasis"; children: Inline[] }
  | { type: "strike"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "break" };

export type Align = "left" | "right" | "center" | null;

export type ListItem = { checked: boolean | null; blocks: Block[] };

export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "code"; lang: string | null; value: string }
  | { type: "quote"; blocks: Block[] }
  | { type: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { type: "rule" };

export type ExportDocument = { title: string; blocks: Block[] };

/** Campos do documento que o export usa (subconjunto de ContentFile). */
export type ExportableFile = {
  path: string;
  name: string;
  title: string;
  status: string | null;
  body: string;
};

export type ExportInput = {
  file: ExportableFile;
  /** Autor da última edição feita no site, se houver. */
  editedBy: string | null;
  editedAt: string | null;
  now?: Date;
};

export type ExportMeta = {
  title: string;
  path: string;
  status: string | null;
  client: string;
  project: string;
  brand: string;
  exportedAt: Date;
  editedBy: string | null;
  editedAt: Date | null;
};

export type ExportResult = { blob: Blob; filename: string; warnings: string[] };

export const EXPORT_IDENTITY = {
  client: "Sr. Jorge",
  project: "Diagnóstico estratégico de IA",
  brand: "Atomica",
} as const;
