import { useEffect, useMemo, useState } from "react";
import type { ContentFile } from "../lib/decrypt";
import {
  computeDocStatus,
  fetchAllValidations,
  groupValidationsByDoc,
  isValidatable,
  type DocStatus,
  type Validation,
} from "../lib/validation";

type Props = {
  files: ContentFile[];
  onNavigate: (path: string) => void;
  onClose: () => void;
};

const GROUPS: { status: DocStatus; label: string; icon: string }[] = [
  { status: "validado", label: "Validados (100%)", icon: "✓" },
  { status: "em-progresso", label: "Em progresso", icon: "◐" },
  { status: "pendente", label: "Pendentes", icon: "○" },
];

export function ValidationPanel({ files, onNavigate, onClose }: Props) {
  const [validations, setValidations] = useState<Validation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllValidations()
      .then((rows) => {
        if (!cancelled) setValidations(rows);
      })
      .catch(() => {
        if (!cancelled) setValidations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byDoc = useMemo(() => groupValidationsByDoc(validations ?? []), [validations]);

  const validatableFiles = useMemo(() => files.filter(isValidatable), [files]);

  const grouped = useMemo(() => {
    const out: Record<DocStatus, ContentFile[]> = { validado: [], "em-progresso": [], pendente: [] };
    for (const file of validatableFiles) {
      const status = computeDocStatus(byDoc.get(file.path) ?? []);
      out[status].push(file);
    }
    return out;
  }, [validatableFiles, byDoc]);

  return (
    <div className="roadmap-drawer-backdrop" onClick={onClose}>
      <div className="roadmap-drawer poster-card validation-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="roadmap-drawer-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <p className="eyebrow">Progresso de validação</p>
        <h2 className="font-display roadmap-drawer-title">Documentos</h2>
        <p className="roadmap-drawer-copy">
          Um documento fica 100% validado quando Pedro, Leticia e Alexandre marcam o check. READMEs e conteúdo de
          "Click Up AI (Brain 2)" não entram nesta contagem.
        </p>
        {validations === null ? (
          <p className="roadmap-drawer-copy">Carregando…</p>
        ) : (
          <div className="roadmap-checklist">
            {GROUPS.map((group) => {
              const docs = grouped[group.status];
              if (docs.length === 0) return null;
              return (
                <div key={group.status} className={`roadmap-checklist-group roadmap-checklist-group--${statusToRoadmapClass(group.status)}`}>
                  <p className="font-label roadmap-checklist-group-title">
                    {group.label} <span className="roadmap-checklist-count">{docs.length}</span>
                  </p>
                  <ul className="roadmap-checklist-items">
                    {docs.map((file) => (
                      <li key={file.path} className={`roadmap-checklist-item roadmap-checklist-item--${statusToRoadmapClass(group.status)}`}>
                        <span className="roadmap-checklist-icon" aria-hidden="true">
                          {group.icon}
                        </span>
                        <button type="button" className="validation-panel-doc-btn" onClick={() => { onNavigate(file.path); onClose(); }}>
                          {file.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function statusToRoadmapClass(status: DocStatus): "done" | "in-progress" | "pending" {
  if (status === "validado") return "done";
  if (status === "em-progresso") return "in-progress";
  return "pending";
}
