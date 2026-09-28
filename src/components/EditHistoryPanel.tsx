import { useEffect, useState } from "react";
import { diffLines, diffWords } from "diff";
import { fetchRevisionHistory, type Revision } from "../lib/revisions";
import { initials, userColor, type UserName } from "../lib/user";

type Props = {
  docPath: string;
  docTitle: string;
  originalBody: string;
  currentUser: UserName | null;
  /** Bump to refetch after a save. */
  refreshKey: number;
  onClose: () => void;
  onRestore: (body: string, label: string) => Promise<void>;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Line diff; changed line pairs get a word-level highlight inside. */
function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);
  const rows: { kind: "add" | "del" | "ctx"; text: React.ReactNode; key: string }[] = [];
  parts.forEach((part, i) => {
    const next = parts[i + 1];
    if (part.removed && next?.added) {
      const words = diffWords(part.value, next.value);
      rows.push({ kind: "del", key: `${i}d`, text: words.filter((w) => !w.added).map((w, j) => (w.removed ? <del key={j}>{w.value}</del> : w.value)) });
      rows.push({ kind: "add", key: `${i}a`, text: words.filter((w) => !w.removed).map((w, j) => (w.added ? <ins key={j}>{w.value}</ins> : w.value)) });
      return;
    }
    if (part.added && parts[i - 1]?.removed) return;
    if (part.added || part.removed) {
      rows.push({ kind: part.added ? "add" : "del", key: String(i), text: part.value });
      return;
    }
    // Unchanged context: keep only 2 lines around each change.
    const lines = part.value.replace(/\n$/, "").split("\n");
    const ctx = lines.length > 4 ? [...lines.slice(0, i === 0 ? 0 : 2), "…", ...lines.slice(i === parts.length - 1 ? lines.length : -2)] : lines;
    rows.push({ kind: "ctx", key: String(i), text: ctx.join("\n") });
  });
  if (!rows.some((r) => r.kind !== "ctx")) return <p className="edit-history-empty">Sem alterações de texto.</p>;
  return (
    <pre className="edit-history-diff">
      {rows.map((r) => (
        <div key={r.key} className={`edit-history-diff-row is-${r.kind}`}>
          <span className="edit-history-diff-sign">{r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}</span>
          <span>{r.text}</span>
        </div>
      ))}
    </pre>
  );
}

export function EditHistoryPanel({ docPath, docTitle, originalBody, currentUser, refreshKey, onClose, onRestore }: Props) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRevisions(null);
    setError(null);
    fetchRevisionHistory(docPath)
      .then((r) => !cancelled && setRevisions(r))
      .catch(() => !cancelled && setError("Não foi possível carregar o histórico."));
    return () => {
      cancelled = true;
    };
  }, [docPath, refreshKey]);

  async function restore(body: string, label: string) {
    if (!window.confirm(`Restaurar ${label}? Isso cria uma nova edição no histórico.`)) return;
    setRestoring(true);
    try {
      await onRestore(body, label);
    } finally {
      setRestoring(false);
    }
  }

  const latestId = revisions?.[0]?.id;

  return (
    <div className="comment-modal-backdrop edit-history-backdrop" onClick={onClose}>
      <aside className="edit-history-drawer poster-card" onClick={(e) => e.stopPropagation()} aria-label="Histórico de edições">
        <button type="button" className="roadmap-drawer-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <p className="eyebrow">Histórico de edições</p>
        <h3 className="font-display edit-history-title">{docTitle}</h3>
        <p className="edit-history-note">Registro permanente: entradas não podem ser alteradas nem excluídas.</p>

        {error && <p className="doc-editor-error">{error}</p>}
        {!revisions && !error && <p className="edit-history-empty">Carregando…</p>}

        {revisions && (
          <ol className="edit-history-list">
            {revisions.map((rev, idx) => {
              const isOpen = expanded === rev.id;
              const isCurrent = rev.id === latestId;
              return (
                <li key={rev.id} className="edit-history-item">
                  <button type="button" className="edit-history-item-head" onClick={() => setExpanded(isOpen ? null : rev.id)} aria-expanded={isOpen}>
                    <span className="comment-thread-avatar" style={{ background: userColor(rev.author) }}>
                      {initials(rev.author)}
                    </span>
                    <span className="edit-history-item-meta">
                      <strong>{rev.author}</strong>
                      <span>{formatDateTime(rev.created_at)}</span>
                      <span className="edit-history-summary">
                        #{revisions.length - idx} · {rev.summary}
                        {isCurrent && " · versão atual"}
                      </span>
                    </span>
                    <span className="edit-history-chevron">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div className="edit-history-item-body">
                      <DiffView before={rev.body_before} after={rev.body_after} />
                      {currentUser && !isCurrent && (
                        <button
                          type="button"
                          className="comment-thread-action"
                          disabled={restoring}
                          onClick={() => restore(rev.body_after, `a versão #${revisions.length - idx}`)}
                        >
                          Restaurar esta versão
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            <li className="edit-history-item edit-history-item--origin">
              <div className="edit-history-item-head">
                <span className="comment-thread-avatar">◎</span>
                <span className="edit-history-item-meta">
                  <strong>Versão original</strong>
                  <span>Publicação do diagnóstico</span>
                </span>
              </div>
              {currentUser && revisions.length > 0 && (
                <div className="edit-history-item-body">
                  <button type="button" className="comment-thread-action" disabled={restoring} onClick={() => restore(originalBody, "a versão original")}>
                    Restaurar versão original
                  </button>
                </div>
              )}
            </li>
          </ol>
        )}
      </aside>
    </div>
  );
}
