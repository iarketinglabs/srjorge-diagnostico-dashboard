import { EXPORT_IDENTITY, type ExportInput, type ExportMeta } from "./types.ts";

/** Cabeçalho do documento exportado. Status só aparece se o corpo ainda não o traz. */
export function buildMeta(input: ExportInput): ExportMeta {
  const { file } = input;
  const bodyHasStatus = /\*\*Status:\*\*/.test(file.body);
  return {
    title: file.title,
    path: file.path,
    status: bodyHasStatus ? null : file.status,
    client: EXPORT_IDENTITY.client,
    project: EXPORT_IDENTITY.project,
    brand: EXPORT_IDENTITY.brand,
    exportedAt: input.now ?? new Date(),
    editedBy: input.editedBy,
    editedAt: input.editedAt ? new Date(input.editedAt) : null,
  };
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
