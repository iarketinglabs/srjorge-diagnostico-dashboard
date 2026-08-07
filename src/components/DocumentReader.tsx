import { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentFile } from "../lib/decrypt";
import { buildPathIndex, resolveDocRef } from "../lib/docLinks";
import { displaySegment } from "../lib/displayName";

type Props = {
  file: ContentFile | null;
  allFiles: ContentFile[];
  onNavigate: (path: string) => void;
  onFocusFolder: (folderPath: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
};

function StatusBadges({ tags }: { tags: ContentFile["tags"] }) {
  if (tags.factual + tags.hipotese + tags.pendente === 0) return null;
  return (
    <div className="reader-badges">
      {tags.factual > 0 && <span className="reader-badge reader-badge--factual">factual · {tags.factual}</span>}
      {tags.hipotese > 0 && <span className="reader-badge reader-badge--hipotese">hipótese · {tags.hipotese}</span>}
      {tags.pendente > 0 && <span className="reader-badge reader-badge--pendente">pendente · {tags.pendente}</span>}
    </div>
  );
}

function Breadcrumbs({
  path,
  title,
  onFocusFolder,
  onNavigate,
}: {
  path: string;
  title: string;
  onFocusFolder: (folderPath: string) => void;
  onNavigate: (path: string) => void;
}) {
  const segments = path.split("/").filter(Boolean);
  const folderSegments = segments.slice(0, -1);

  return (
    <nav className="reader-breadcrumbs" aria-label="Caminho do documento">
      <button type="button" className="reader-breadcrumb-item" onClick={() => onFocusFolder("")}>
        Diagnóstico
      </button>
      {folderSegments.map((seg, i) => {
        const folderPath = folderSegments.slice(0, i + 1).join("/");
        return (
          <span key={folderPath} className="reader-breadcrumb-seg">
            <span className="reader-breadcrumb-sep" aria-hidden="true">
              ›
            </span>
            <button type="button" className="reader-breadcrumb-item" onClick={() => onFocusFolder(folderPath)}>
              {displaySegment(seg, false)}
            </button>
          </span>
        );
      })}
      <span className="reader-breadcrumb-seg">
        <span className="reader-breadcrumb-sep" aria-hidden="true">
          ›
        </span>
        <button
          type="button"
          className="reader-breadcrumb-item reader-breadcrumb-item--current"
          onClick={() => onNavigate(path)}
        >
          {title}
        </button>
      </span>
    </nav>
  );
}

export function DocumentReader({
  file,
  allFiles,
  onNavigate,
  onFocusFolder,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: Props) {
  const pathIndex = useMemo(() => buildPathIndex(allFiles), [allFiles]);

  const markdownComponents = useMemo(
    () => ({
      code({ children, className, ...rest }: { children?: ReactNode; className?: string }) {
        const text = String(children ?? "");
        const resolved = !className && !text.includes("\n") ? resolveDocRef(text, pathIndex) : null;
        if (resolved) {
          return (
            <button type="button" className="reader-inline-link" onClick={() => onNavigate(resolved)}>
              {text}
            </button>
          );
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
      a({ href, children }: { href?: string; children?: ReactNode }) {
        const resolved = href ? resolveDocRef(href, pathIndex) : null;
        if (resolved) {
          return (
            <button type="button" className="reader-inline-link" onClick={() => onNavigate(resolved)}>
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    }),
    [pathIndex, onNavigate]
  );

  const toolbar = (
    <div className="reader-toolbar">
      <div className="reader-toolbar-nav">
        <button type="button" className="reader-nav-btn" onClick={onBack} disabled={!canGoBack} aria-label="Voltar">
          ←
        </button>
        <button
          type="button"
          className="reader-nav-btn"
          onClick={onForward}
          disabled={!canGoForward}
          aria-label="Avançar"
        >
          →
        </button>
      </div>
      {file && <Breadcrumbs path={file.path} title={file.title} onFocusFolder={onFocusFolder} onNavigate={onNavigate} />}
    </div>
  );

  if (!file) {
    return (
      <div className="reader-panel reader-panel--empty">
        {toolbar}
        <p className="eyebrow">Leitura de documentos</p>
        <p className="reader-empty-copy">
          Selecione um item na base de conhecimento à esquerda para ler o documento completo aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="reader-panel">
      {toolbar}
      <p className="eyebrow">{file.path}</p>
      <h2 className="font-display reader-title">{file.title}</h2>
      {file.status && <p className="reader-status">{file.status}</p>}
      <StatusBadges tags={file.tags} />
      <div className="reader-text-surface">
        <div className="reader-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {file.body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
