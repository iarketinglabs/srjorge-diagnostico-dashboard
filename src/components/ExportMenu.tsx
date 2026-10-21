import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ContentFile } from "../lib/decrypt";
import { exportDocument, type ExportKind } from "../lib/export";
import { saveBlob } from "../lib/export/download";
import type { Revision } from "../lib/revisions";

const OPTIONS: { kind: ExportKind; label: string; extension: string }[] = [
  { kind: "docx", label: "Word", extension: ".docx" },
  { kind: "pdf", label: "PDF", extension: ".pdf" },
  { kind: "md", label: "Markdown", extension: ".md" },
];

type Props = {
  file: ContentFile;
  latestRevision: Revision | null;
  /** Edição em andamento: o texto exportado seria diferente do que está salvo. */
  disabled: boolean;
};

/** Deixa o indicador "Gerando…" aparecer antes do trabalho pesado começar. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function ExportMenu({ file, latestRevision, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setOpen(false);
    setError(null);
    setNotice(null);
  }, [file.path]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  async function run(kind: ExportKind) {
    setOpen(false);
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await nextPaint();
      const result = await exportDocument(kind, {
        file,
        editedBy: latestRevision?.author ?? null,
        editedAt: latestRevision?.created_at ?? null,
      });
      saveBlob(result.blob, result.filename);
      if (result.warnings.length > 0) setNotice(result.warnings.join(" "));
    } catch {
      setError("Não foi possível gerar o arquivo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="export-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="reader-comment-mode-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy !== null}
        title={disabled ? "Saia do modo de edição para exportar" : "Exportar este documento"}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? "Gerando…" : "⬇ Exportar"}
      </button>
      {open && (
        <div role="menu" aria-label="Formato de exportação" className="export-menu-list" onKeyDown={onMenuKeyDown}>
          {OPTIONS.map((option, index) => (
            <button
              key={option.kind}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => void run(option.kind)}
            >
              <span>{option.label}</span>
              <span className="export-menu-ext">{option.extension}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="export-menu-message is-error">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="export-menu-message">
          {notice}
        </p>
      )}
    </div>
  );
}
