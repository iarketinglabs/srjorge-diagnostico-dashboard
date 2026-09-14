import { useState, type FormEvent } from "react";

type Props = {
  quote: string;
  onCancel: () => void;
  onSubmit: (body: string) => Promise<void>;
};

export function CommentModal({ quote, onCancel, onSubmit }: Props) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(body.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="comment-modal-backdrop" onClick={onCancel}>
      <div className="comment-modal poster-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="roadmap-drawer-close" onClick={onCancel} aria-label="Cancelar">
          ×
        </button>
        <p className="eyebrow">Novo comentário</p>
        <blockquote className="comment-modal-quote">"{quote}"</blockquote>
        <form onSubmit={handleSubmit} className="field">
          <label htmlFor="comment-body">Comentário</label>
          <textarea
            id="comment-body"
            className="field-control comment-modal-textarea"
            autoFocus
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={saving}
          />
          <button type="submit" className="atomica-button" disabled={saving || !body.trim()}>
            {saving ? "Salvando…" : "Comentar"}
          </button>
        </form>
      </div>
    </div>
  );
}
