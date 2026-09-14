import { supabaseInsert, supabaseSelect, supabaseUpdate } from "./supabaseClient";
import type { UserName } from "./user";

export type CommentStatus = "open" | "done";

export type Comment = {
  id: string;
  doc_path: string;
  quote_exact: string;
  quote_prefix: string | null;
  quote_suffix: string | null;
  body: string;
  author: UserName;
  status: CommentStatus;
  deleted_at: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
};

/** A comment "thread" is a root comment (parent_id null) plus its replies. */
export type CommentThreadData = {
  root: Comment;
  replies: Comment[];
};

export async function fetchComments(docPath: string): Promise<Comment[]> {
  return supabaseSelect<Comment>(
    "srjorge_comments",
    `doc_path=eq.${encodeURIComponent(docPath)}&order=created_at.asc`
  );
}

export function groupThreads(comments: Comment[]): CommentThreadData[] {
  const roots = comments.filter((c) => !c.parent_id);
  return roots
    .map((root) => ({
      root,
      replies: comments.filter((c) => c.parent_id === root.id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
    // A thread is hidden entirely once its root comment is deleted/finalized.
    .filter((t) => !t.root.deleted_at);
}

export async function createComment(input: {
  doc_path: string;
  quote_exact: string;
  quote_prefix: string | null;
  quote_suffix: string | null;
  body: string;
  author: UserName;
  parent_id?: string | null;
}): Promise<Comment> {
  const [row] = await supabaseInsert<Comment>("srjorge_comments", {
    doc_path: input.doc_path,
    quote_exact: input.quote_exact,
    quote_prefix: input.quote_prefix,
    quote_suffix: input.quote_suffix,
    body: input.body,
    author: input.author,
    parent_id: input.parent_id ?? null,
  });
  return row;
}

export async function editComment(id: string, body: string): Promise<Comment> {
  const [row] = await supabaseUpdate<Comment>("srjorge_comments", `id=eq.${id}`, {
    body,
    edited: true,
    updated_at: new Date().toISOString(),
  });
  return row;
}

export async function markCommentDone(id: string, done: boolean): Promise<Comment> {
  const [row] = await supabaseUpdate<Comment>("srjorge_comments", `id=eq.${id}`, {
    status: done ? "done" : "open",
    updated_at: new Date().toISOString(),
  });
  return row;
}

/** Both "excluir" and "finalizar" hide the thread from the UI via deleted_at —
 * never a hard DELETE, so the audit trail stays queryable in the database. */
export async function softDeleteComment(id: string): Promise<Comment> {
  const [row] = await supabaseUpdate<Comment>("srjorge_comments", `id=eq.${id}`, {
    deleted_at: new Date().toISOString(),
  });
  return row;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Best-effort: wraps the first raw-markdown occurrence of each open
 * thread's quote in a <mark> so react-markdown (with rehype-raw) renders a
 * clickable highlight. Quotes that don't match verbatim in the source (e.g.
 * a selection that spanned rendered-only formatting) are simply not
 * highlighted inline — they still show up as a bubble in the comment rail. */
export function injectCommentMarks(body: string, threads: CommentThreadData[]): string {
  let out = body;
  for (const { root } of threads) {
    const re = new RegExp(escapeRegExp(root.quote_exact));
    if (re.test(out)) {
      out = out.replace(re, `<mark class="comment-highlight" data-comment-id="${root.id}">${root.quote_exact}</mark>`);
    }
  }
  return out;
}

/** Position (0..1) of a thread's quote within the document, used to place
 * its bubble proportionally along the comment rail. */
export function threadOffset(body: string, thread: CommentThreadData): number {
  const idx = body.indexOf(thread.root.quote_exact);
  if (idx < 0 || body.length === 0) return 0;
  return idx / body.length;
}

/** Builds a simple TextQuoteSelector (exact + small prefix/suffix context)
 * from the current window selection, so the comment can be re-anchored in
 * the markdown body later without depending on DOM offsets that change on
 * every re-render. */
export function captureSelectionQuote(container: HTMLElement): { exact: string; prefix: string; suffix: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const exact = selection.toString().trim();
  if (!exact) return null;

  const full = container.textContent ?? "";
  const idx = full.indexOf(exact);
  const prefix = idx > 0 ? full.slice(Math.max(0, idx - 30), idx) : "";
  const suffix = idx >= 0 ? full.slice(idx + exact.length, idx + exact.length + 30) : "";
  return { exact, prefix, suffix };
}
