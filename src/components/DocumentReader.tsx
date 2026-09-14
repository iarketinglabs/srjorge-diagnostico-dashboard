import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { ContentFile } from "../lib/decrypt";
import { buildPathIndex, resolveDocRef } from "../lib/docLinks";
import { displaySegment } from "../lib/displayName";
import {
  captureSelectionQuote,
  createComment,
  editComment,
  fetchComments,
  groupThreads,
  injectCommentMarks,
  markCommentDone,
  softDeleteComment,
  threadOffset,
  type CommentThreadData,
} from "../lib/comments";
import { initials, type UserName } from "../lib/user";
import { isValidatable } from "../lib/validation";
import { CommentModal } from "./CommentModal";
import { CommentThread } from "./CommentThread";
import { DocValidationChecks } from "./DocValidationChecks";

type Props = {
  file: ContentFile | null;
  allFiles: ContentFile[];
  onNavigate: (path: string) => void;
  onFocusFolder: (folderPath: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  currentUser: UserName | null;
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
  currentUser,
}: Props) {
  const pathIndex = useMemo(() => buildPathIndex(allFiles), [allFiles]);

  const [commentMode, setCommentMode] = useState(false);
  const [threads, setThreads] = useState<CommentThreadData[]>([]);
  const [pendingQuote, setPendingQuote] = useState<{ exact: string; prefix: string; suffix: string } | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const docPath = file?.path ?? null;

  useEffect(() => {
    setThreads([]);
    setOpenThreadId(null);
    setPendingQuote(null);
    if (!docPath) return;
    let cancelled = false;
    fetchComments(docPath)
      .then((comments) => {
        if (!cancelled) setThreads(groupThreads(comments));
      })
      .catch(() => {
        if (!cancelled) setThreads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  function refreshComments() {
    if (!docPath) return;
    fetchComments(docPath).then((comments) => setThreads(groupThreads(comments)));
  }

  function handleMouseUp() {
    if (!commentMode || !bodyRef.current) return;
    const quote = captureSelectionQuote(bodyRef.current);
    if (quote) setPendingQuote(quote);
  }

  async function handleCreateComment(text: string) {
    if (!docPath || !pendingQuote || !currentUser) return;
    await createComment({
      doc_path: docPath,
      quote_exact: pendingQuote.exact,
      quote_prefix: pendingQuote.prefix,
      quote_suffix: pendingQuote.suffix,
      body: text,
      author: currentUser,
    });
    setPendingQuote(null);
    window.getSelection()?.removeAllRanges();
    refreshComments();
  }

  const openThread = threads.find((t) => t.root.id === openThreadId) ?? null;

  const highlightedBody = useMemo(() => {
    if (!file) return "";
    return injectCommentMarks(file.body, threads);
  }, [file, threads]);

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
      mark({ children, ...rest }: { children?: ReactNode; "data-comment-id"?: string }) {
        const id = (rest as Record<string, string>)["data-comment-id"];
        return (
          <mark className="comment-highlight" onClick={() => id && setOpenThreadId(id)}>
            {children}
          </mark>
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
      {file && currentUser && (
        <button
          type="button"
          className={`reader-comment-mode-btn ${commentMode ? "is-active" : ""}`}
          onClick={() => setCommentMode((v) => !v)}
        >
          {commentMode ? "Modo comentário: ativo" : "Modo comentário"}
        </button>
      )}
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
      {isValidatable(file) && <DocValidationChecks docPath={file.path} currentUser={currentUser} />}
      <div className="reader-text-surface reader-text-surface--with-rail">
        <div className="reader-body" ref={bodyRef} onMouseUp={handleMouseUp}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
            {highlightedBody}
          </ReactMarkdown>
        </div>
        {threads.length > 0 && (
          <aside className="comment-rail" aria-label="Comentários">
            {threads.map((thread) => (
              <button
                key={thread.root.id}
                type="button"
                className={`comment-bubble ${thread.root.status === "done" ? "is-done" : ""}`}
                style={{ top: `${threadOffset(file.body, thread) * 100}%` }}
                onClick={() => setOpenThreadId(thread.root.id)}
                title={`${thread.root.author}: ${thread.root.body}`}
              >
                {initials(thread.root.author)}
                {thread.root.status === "done" && <span className="comment-bubble-check">✓</span>}
              </button>
            ))}
          </aside>
        )}
      </div>
      {pendingQuote && currentUser && (
        <CommentModal quote={pendingQuote.exact} onCancel={() => setPendingQuote(null)} onSubmit={handleCreateComment} />
      )}
      {openThread && (
        <CommentThread
          thread={openThread}
          currentUser={currentUser}
          onClose={() => setOpenThreadId(null)}
          onReply={async (body) => {
            if (!docPath || !currentUser) return;
            await createComment({
              doc_path: docPath,
              quote_exact: openThread.root.quote_exact,
              quote_prefix: openThread.root.quote_prefix,
              quote_suffix: openThread.root.quote_suffix,
              body,
              author: currentUser,
              parent_id: openThread.root.id,
            });
            refreshComments();
          }}
          onEdit={async (id, body) => {
            await editComment(id, body);
            refreshComments();
          }}
          onToggleDone={async (id, done) => {
            await markCommentDone(id, done);
            refreshComments();
          }}
          onSoftDelete={async (id) => {
            await softDeleteComment(id);
            if (id === openThread.root.id) setOpenThreadId(null);
            refreshComments();
          }}
        />
      )}
    </div>
  );
}
