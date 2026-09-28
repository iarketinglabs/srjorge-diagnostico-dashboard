import { diffLines } from "diff";
import { decryptText, encryptText } from "./crypto";
import { supabaseInsert, supabaseSelect } from "./supabaseClient";
import type { UserName } from "./user";

// Log de edições append-only: a RLS de srjorge_doc_revisions só concede
// SELECT/INSERT ao role anon (sem UPDATE/DELETE), e created_at é definido por
// trigger no servidor — nenhuma entrada pode ser alterada ou apagada pelo site.
// "Restaurar" uma versão antiga é apenas mais uma revisão no log.
// Os textos vão cifrados com a senha do dashboard (lib/crypto.ts).
const TABLE = "srjorge_doc_revisions";
const DEVICE_KEY = "srjorge-dashboard-device";

export type Revision = {
  id: string;
  doc_path: string;
  author: string;
  created_at: string;
  body_before: string;
  /** body_before como o editor o regravou antes de qualquer mudança do autor;
   * o diff exibido parte daqui, isolando o que a pessoa realmente alterou. */
  body_before_normalized: string | null;
  body_after: string;
  summary: string;
  base_revision_id: string | null;
  client_info: { device: string; ua: string } | null;
};

export class RevisionConflictError extends Error {
  latest: Revision;
  constructor(latest: Revision) {
    super(`Documento editado por ${latest.author} enquanto você editava.`);
    this.latest = latest;
  }
}

async function decryptRow(row: Revision): Promise<Revision> {
  const [before, beforeNorm, after] = await Promise.all([
    decryptText(row.body_before),
    decryptText(row.body_before_normalized),
    decryptText(row.body_after),
  ]);
  return { ...row, body_before: before ?? "", body_before_normalized: beforeNorm, body_after: after ?? "" };
}

function deviceInfo(): { device: string; ua: string } {
  let device = "desconhecido";
  try {
    device = localStorage.getItem(DEVICE_KEY) ?? "";
    if (!device) {
      device = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, device);
    }
  } catch {
    /* storage bloqueado: segue sem id persistente */
  }
  return { device, ua: navigator.userAgent.slice(0, 200) };
}

/** Última revisão por documento, para sobrepor o body base do data.enc. */
export async function fetchLatestRevisions(): Promise<Map<string, Revision>> {
  const rows = await supabaseSelect<Revision>(TABLE, "select=*&order=created_at.desc");
  const latest = new Map<string, Revision>();
  for (const r of rows) if (!latest.has(r.doc_path)) latest.set(r.doc_path, r);
  const decrypted = await Promise.all([...latest.values()].map(decryptRow));
  return new Map(decrypted.map((r) => [r.doc_path, r]));
}

export async function fetchRevisionHistory(docPath: string): Promise<Revision[]> {
  const rows = await supabaseSelect<Revision>(TABLE, `doc_path=eq.${encodeURIComponent(docPath)}&order=created_at.desc`);
  return Promise.all(rows.map(decryptRow));
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
  /** Omitido em restaurações (não passam pelo editor). */
  beforeNormalized?: string;
  after: string;
  baseRevisionId: string | null;
  summaryPrefix?: string;
}): Promise<Revision> {
  const [latest] = await supabaseSelect<{ id: string; author: string }>(
    TABLE,
    `select=id,author&doc_path=eq.${encodeURIComponent(params.docPath)}&order=created_at.desc&limit=1`
  );
  if ((latest?.id ?? null) !== params.baseRevisionId) {
    const [full] = await fetchRevisionHistory(params.docPath);
    throw new RevisionConflictError(full!);
  }

  const diffBase = params.beforeNormalized ?? params.before;
  const summary = (params.summaryPrefix ?? "") + summarizeChange(diffBase, params.after);
  const [encBefore, encBeforeNorm, encAfter] = await Promise.all([
    encryptText(params.before),
    params.beforeNormalized === undefined ? Promise.resolve(null) : encryptText(params.beforeNormalized),
    encryptText(params.after),
  ]);
  const [row] = await supabaseInsert<Revision>(TABLE, {
    doc_path: params.docPath,
    author: params.author,
    body_before: encBefore,
    body_before_normalized: encBeforeNorm,
    body_after: encAfter,
    summary,
    base_revision_id: params.baseRevisionId,
    client_info: deviceInfo(),
  });
  return decryptRow(row!);
}
