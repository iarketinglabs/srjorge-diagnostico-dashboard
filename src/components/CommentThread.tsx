import { useState, type FormEvent } from "react";
import type { Comment, CommentThreadData } from "../lib/comments";
import { initials, type UserName } from "../lib/user";

type Props = {
  thread: CommentThreadData;
  currentUser: UserName | null;
  onClose: () => void;
  onReply: (body: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onToggleDone: (id: string, done: boolean) => Promise<void>;
  onSoftDelete: (id: string) => Promise<void>;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function CommentRow({
  comment,
  currentUser,
  onEdit,
  onToggleDone,
  onSoftDelete,
  isRoot,
}: {
  comment: Comment;
  currentUser: UserName | null;
  onEdit: (id: string, body: string) => Promise<void>;
  onToggleDone: (id: string, done: boolean) => Promise<void>;
  onSoftDelete: (id: string) => Promise<void>;
  isRoot: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const isMine = currentUser === comment.author;

  return (
    <div className={`comment-thread-row ${comment.status === "done" ? "is-done" : ""}`}>
      <span className="comment-thread-avatar">{initials(comment.author)}</span>
      <div className="comment-thread-row-body">
        <p className="comment-thread-row-meta">
          <strong>{comment.author}</strong> · {formatDate(comment.created_at)}
          {comment.edited && " · editado"}
          {comment.status === "done" && " · ✓ concluído"}
        </p>
        {editing ? (
          <div className="field">
            <textarea
              className="field-control comment-modal-textarea"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="comment-thread-row-actions">
              <button
                type="button"
                className="atomica-button-small"
                onClick={async () => {
                  if (!draft.trim()) return;
                  await onEdit(comment.id, draft.trim());
                  setEditing(false);
                }}
              >
                Salvar
              </button>
              <button type="button" className="comment-thread-action" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-thread-row-text">{comment.body}</p>
        )}
        {!editing && (
          <div className="comment-thread-row-actions">
            {isMine && (
              <button type="button" className="comment-thread-action" onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
            {(isMine || isRoot) && (
              <button type="button" className="comment-thread-action" onClick={() => onToggleDone(comment.id, comment.status !== "done")}>
                {comment.status === "done" ? "Reabrir" : "Concluído"}
              </button>
            )}
            {isMine && (
              <button type="button" className="comment-thread-action comment-thread-action--danger" onClick={() => onSoftDelete(comment.id)}>
                Excluir
              </button>
            )}
            {isRoot && (
              <button type="button" className="comment-thread-action comment-thread-action--danger" onClick={() => onSoftDelete(comment.id)}>
                Finalizar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({ thread, currentUser, onClose, onReply, onEdit, onToggleDone, onSoftDelete }: Props) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await onReply(reply.trim());
      setReply("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="comment-modal-backdrop" onClick={onClose}>
      <div className="comment-thread-popover poster-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="roadmap-drawer-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <p className="eyebrow">Trecho comentado</p>
        <blockquote className="comment-modal-quote">"{thread.root.quote_exact}"</blockquote>
        <div className="comment-thread-list">
          <CommentRow comment={thread.root} currentUser={currentUser} onEdit={onEdit} onToggleDone={onToggleDone} onSoftDelete={onSoftDelete} isRoot />
          {thread.replies
            .filter((r) => !r.deleted_at)
            .map((reply) => (
              <CommentRow key={reply.id} comment={reply} currentUser={currentUser} onEdit={onEdit} onToggleDone={onToggleDone} onSoftDelete={onSoftDelete} isRoot={false} />
            ))}
        </div>
        {currentUser && (
          <form onSubmit={handleReply} className="field comment-thread-reply-form">
            <textarea
              className="field-control comment-modal-textarea"
              rows={2}
              placeholder="Responder…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="atomica-button-small" disabled={sending || !reply.trim()}>
              {sending ? "Enviando…" : "Responder"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
