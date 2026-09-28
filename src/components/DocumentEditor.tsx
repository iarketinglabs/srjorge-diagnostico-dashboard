import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { confirmDiscardEdits, setUnsavedEdits } from "../lib/editGuard";

type Props = {
  initialMarkdown: string;
  /** baseline = initialMarkdown como o editor o serializa sem nenhuma mudança
   * do autor; usado para que o diff não atribua a normalização a ninguém. */
  onSave: (markdown: string, baseline: string) => Promise<void>;
  onCancel: () => void;
};


type ToolButton = {
  label: string;
  title: string;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
  className?: string;
};

const GROUPS: ToolButton[][] = [
  [
    { label: "↶", title: "Desfazer", run: (e) => e.chain().focus().undo().run() },
    { label: "↷", title: "Refazer", run: (e) => e.chain().focus().redo().run() },
  ],
  [
    { label: "P", title: "Parágrafo", run: (e) => e.chain().focus().setParagraph().run(), active: (e) => e.isActive("paragraph") },
    { label: "H1", title: "Título 1", run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
    { label: "H2", title: "Título 2", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
    { label: "H3", title: "Título 3", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  ],
  [
    { label: "B", title: "Negrito (Ctrl+B)", run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold"), className: "is-bold" },
    { label: "I", title: "Itálico (Ctrl+I)", run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic"), className: "is-italic" },
    { label: "U", title: "Sublinhado (Ctrl+U)", run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive("underline"), className: "is-underline" },
    { label: "S", title: "Tachado", run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike"), className: "is-strike" },
    { label: "</>", title: "Código", run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive("code") },
    {
      label: "🔗",
      title: "Link",
      run: (e) => {
        const prev = e.getAttributes("link").href as string | undefined;
        const href = window.prompt("URL do link (vazio para remover):", prev ?? "https://");
        if (href === null) return;
        if (!href.trim()) e.chain().focus().extendMarkRange("link").unsetLink().run();
        else e.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
      },
      active: (e) => e.isActive("link"),
    },
  ],
  [
    { label: "• Lista", title: "Lista com marcadores", run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
    { label: "1. Lista", title: "Lista numerada", run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
    { label: "❝", title: "Citação", run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
    { label: "{ }", title: "Bloco de código", run: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive("codeBlock") },
    { label: "―", title: "Linha horizontal", run: (e) => e.chain().focus().setHorizontalRule().run() },
  ],
  [
    { label: "▦ Tabela", title: "Inserir tabela", run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: "+Lin", title: "Adicionar linha", run: (e) => e.chain().focus().addRowAfter().run() },
    { label: "+Col", title: "Adicionar coluna", run: (e) => e.chain().focus().addColumnAfter().run() },
    { label: "−Lin", title: "Remover linha", run: (e) => e.chain().focus().deleteRow().run() },
    { label: "−Col", title: "Remover coluna", run: (e) => e.chain().focus().deleteColumn().run() },
    { label: "✕Tab", title: "Remover tabela", run: (e) => e.chain().focus().deleteTable().run() },
  ],
];

export function DocumentEditor({ initialMarkdown, onSave, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baselineRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown,
    ],
    content: initialMarkdown,
    contentType: "markdown",
    onCreate: ({ editor: e }) => {
      baselineRef.current = e.getMarkdown();
    },
  });

  const dirty =
    useEditorState({
      editor,
      selector: ({ editor: e }) => !!e && baselineRef.current !== null && e.getMarkdown() !== baselineRef.current,
    }) ?? false;

  useEffect(() => {
    setUnsavedEdits(dirty);
    if (!dirty) return;
    const onBeforeUnload = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => () => setUnsavedEdits(false), []);

  // Re-render the toolbar on selection/content changes so active states stay in sync.
  const activeStates = useEditorState({
    editor,
    selector: ({ editor: e }) => GROUPS.flat().map((b) => (e && b.active ? b.active(e) : false)),
  });

  function handleCancel() {
    if (confirmDiscardEdits()) onCancel();
  }

  async function handleSave() {
    if (!editor || saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(editor.getMarkdown(), baselineRef.current ?? initialMarkdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/Cmd+S salva, Esc pergunta se descarta — refs evitam re-registrar a cada tecla.
  const handlersRef = useRef({ handleSave, handleCancel });
  handlersRef.current = { handleSave, handleCancel };
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        void handlersRef.current.handleSave();
      } else if (ev.key === "Escape") {
        handlersRef.current.handleCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let flatIndex = 0;
  return (
    <div className="doc-editor">
      <div className="doc-editor-toolbar" role="toolbar" aria-label="Formatação">
        {GROUPS.map((group, gi) => (
          <div key={gi} className="doc-editor-group">
            {group.map((btn) => {
              const isActive = activeStates?.[flatIndex++] ?? false;
              return (
                <button
                  key={btn.title}
                  type="button"
                  title={btn.title}
                  aria-label={btn.title}
                  aria-pressed={btn.active ? isActive : undefined}
                  className={`doc-editor-btn ${btn.className ?? ""} ${isActive ? "is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editor && btn.run(editor)}
                  disabled={!editor}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        ))}
        <div className="doc-editor-actions">
          <span className={`doc-editor-state ${dirty ? "is-dirty" : ""}`}>{dirty ? "● Alterações não salvas" : "Sem alterações"}</span>
          <button type="button" className="comment-thread-action" onClick={handleCancel} disabled={saving} title="Descartar (Esc)">
            Descartar
          </button>
          <button type="button" className="atomica-button-small" onClick={handleSave} disabled={saving || !editor || !dirty} title="Salvar (Ctrl+S)">
            {saving ? "Salvando…" : "Salvar edição"}
          </button>
        </div>
        {error && <p className="doc-editor-error">{error}</p>}
      </div>
      <div className="doc-editor-scroll">
        <div className="reader-text-surface">
          <EditorContent editor={editor} className="reader-body doc-editor-content" />
        </div>
      </div>
    </div>
  );
}
