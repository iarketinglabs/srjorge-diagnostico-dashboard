import { diffLines } from "diff";
import { supabaseInsert, supabaseSelect } from "./supabaseClient";
import type { UserName } from "./user";

// Log de edições append-only: a RLS de srjorge_doc_revisions só concede
// SELECT/INSERT ao role anon (sem UPDATE/DELETE), e created_at é definido por
// trigger no servidor — nenhuma entrada pode ser alterada ou apagada pelo site.
// "Restaurar" uma versão antiga é apenas mais uma revisão no log.
const TABLE = "srjorge_doc_revisions";

export type Revision = {
  id: string;
  doc_path: string;
  author: string;
  created_at: string;
  body_before: string;
  body_after: string;
  summary: string;
  base_revision_id: string | null;
};

export class RevisionConflictError extends Error {
  latest: Revision;
  constructor(latest: Revision) {
    super(`Documento editado por ${latest.author} enquanto você editava.`);
    this.latest = latest;
  }
}

/** Última revisão por documento, para sobrepor o body base do data.enc. */
export async function fetchLatestRevisions(): Promise<Map<string, Revision>> {
  const rows = await supabaseSelect<Revision>(TABLE, "select=*&order=created_at.desc");
  const latest = new Map<string, Revision>();
  for (const r of rows) if (!latest.has(r.doc_path)) latest.set(r.doc_path, r);
  return latest;
}

export async function fetchRevisionHistory(docPath: string): Promise<Revision[]> {
  return supabaseSelect<Revision>(TABLE, `doc_path=eq.${encodeURIComponent(docPath)}&order=created_at.desc`);
}

export function summarizeChange(before: string, after: string): string {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(before, after)) {
    if (part.added) added += part.count ?? 0;
    else if (part.removed) removed += part.count ?? 0;
  }
  return `+${added} linha${added === 1 ? "" : "s"} / −${removed} linha${removed === 1 ? "" : "s"}`;
}

export async function saveRevision(params: {
  docPath: string;
  author: UserName;
  before: string;
  after: string;
  baseRevisionId: string | null;
  summaryPrefix?: string;
}): Promise<Revision> {
  const history = await fetchRevisionHistory(params.docPath);
  const latest = history[0] ?? null;
  if ((latest?.id ?? null) !== params.baseRevisionId) throw new RevisionConflictError(latest!);

  const summary = (params.summaryPrefix ?? "") + summarizeChange(params.before, params.after);
  const [row] = await supabaseInsert<Revision>(TABLE, {
    doc_path: params.docPath,
    author: params.author,
    body_before: params.before,
    body_after: params.after,
    summary,
    base_revision_id: params.baseRevisionId,
  });
  return row!;
}
