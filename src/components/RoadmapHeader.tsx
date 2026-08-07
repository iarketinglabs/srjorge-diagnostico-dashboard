import { useState } from "react";
import type { RoadmapItem, RoadmapItemStatus, RoadmapStage, StatusSnapshot } from "../lib/decrypt";
import logoUrl from "../assets/logos/logo-atomica-preta-sem-fundo.png";

type Props = {
  roadmap: RoadmapStage[];
  statusSnapshot: StatusSnapshot;
};

const STATE_LABEL: Record<RoadmapItemStatus, string> = {
  done: "Concluído",
  "in-progress": "Em andamento",
  pending: "Pendente",
};

const CHECKLIST_GROUPS: { status: RoadmapItemStatus; label: string; icon: string }[] = [
  { status: "done", label: "Concluído", icon: "✓" },
  { status: "in-progress", label: "Em andamento", icon: "◐" },
  { status: "pending", label: "Pendente", icon: "○" },
];

function Checklist({ items }: { items: RoadmapItem[] }) {
  return (
    <div className="roadmap-checklist">
      {CHECKLIST_GROUPS.map((group) => {
        const groupItems = items.filter((it) => it.status === group.status);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.status} className={`roadmap-checklist-group roadmap-checklist-group--${group.status}`}>
            <p className="font-label roadmap-checklist-group-title">
              {group.label} <span className="roadmap-checklist-count">{groupItems.length}</span>
            </p>
            <ul className="roadmap-checklist-items">
              {groupItems.map((it, idx) => (
                <li key={idx} className={`roadmap-checklist-item roadmap-checklist-item--${it.status}`}>
                  <span className="roadmap-checklist-icon" aria-hidden="true">
                    {group.icon}
                  </span>
                  <span>{it.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function RoadmapHeader({ roadmap, statusSnapshot }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = roadmap.find((s) => s.id === openId) ?? null;

  return (
    <header className="atomica-header roadmap-header">
      <div className="container roadmap-header-inner">
        <div className="roadmap-brand">
          <img src={logoUrl} alt="Atomica" className="brand-mark" />
          <div>
            <p className="font-label roadmap-brand-title">Diagnóstico Sr. Jorge</p>
            <p className="roadmap-brand-sub">{statusSnapshot.faseGateAtual}</p>
          </div>
        </div>

        <ol className="roadmap-track" aria-label="Roadmap do diagnóstico">
          {roadmap.map((stage, i) => (
            <li key={stage.id} className="roadmap-node-wrap">
              <button
                type="button"
                className={`roadmap-node roadmap-node--${stage.estadoAtual} ${openId === stage.id ? "is-open" : ""}`}
                onClick={() => setOpenId(openId === stage.id ? null : stage.id)}
                aria-expanded={openId === stage.id}
              >
                <span className="roadmap-node-index">{stage.numero}</span>
                <span className="roadmap-node-label">{stage.nome}</span>
                <span className="roadmap-node-state">{STATE_LABEL[stage.estadoAtual]}</span>
              </button>
              {i < roadmap.length - 1 && (
                <span
                  className={`roadmap-connector ${
                    stage.estadoAtual === "done" || stage.estadoAtual === "in-progress" ? "roadmap-connector--flow" : ""
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </div>

      {active && (
        <div className="roadmap-drawer-backdrop" onClick={() => setOpenId(null)}>
          <div className="roadmap-drawer poster-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="roadmap-drawer-close" onClick={() => setOpenId(null)} aria-label="Fechar">
              ×
            </button>
            <p className="eyebrow">
              Fase {active.numero} · {active.semanas}
            </p>
            <h2 className="font-display roadmap-drawer-title">{active.nome}</h2>
            <span className={`roadmap-pill roadmap-pill--${active.estadoAtual}`}>{STATE_LABEL[active.estadoAtual]}</span>
            <p className="roadmap-drawer-copy">{active.resumo}</p>
            <p className="roadmap-drawer-deliverable">
              <strong>Entregável:</strong> {active.entregavel}
            </p>
            <h3 className="font-label roadmap-drawer-subtitle">O que já foi feito / está pendente</h3>
            <Checklist items={active.detalhes} />
          </div>
        </div>
      )}
    </header>
  );
}
