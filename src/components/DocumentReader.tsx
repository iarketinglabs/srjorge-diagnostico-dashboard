import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentFile } from "../lib/decrypt";

type Props = {
  file: ContentFile | null;
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

export function DocumentReader({ file }: Props) {
  if (!file) {
    return (
      <div className="reader-panel reader-panel--empty">
        <p className="eyebrow">Leitura de documentos</p>
        <p className="reader-empty-copy">
          Selecione um item na base de conhecimento à esquerda para ler o documento completo aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="reader-panel">
      <p className="eyebrow">{file.path}</p>
      <h2 className="font-display reader-title">{file.title}</h2>
      {file.status && <p className="reader-status">{file.status}</p>}
      <StatusBadges tags={file.tags} />
      <div className="reader-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.body}</ReactMarkdown>
      </div>
    </div>
  );
}
