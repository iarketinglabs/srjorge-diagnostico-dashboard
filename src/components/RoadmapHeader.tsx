import { useState } from "react";
import type { RoadmapStage, StatusSnapshot } from "../lib/decrypt";
import logoUrl from "../assets/logos/logo-atomica-preta-sem-fundo.png";

type Props = {
  roadmap: RoadmapStage[];
  statusSnapshot: StatusSnapshot;
};

const STATE_LABEL: Record<RoadmapStage["estadoAtual"], string> = {
  done: "Concluído",
  "in-progress": "Em andamento",
  pending: "Pendente",
};

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
              {i < roadmap.length - 1 && <span className="roadmap-connector" aria-hidden="true" />}
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
            <ul className="roadmap-drawer-list">
              {active.detalhes.map((d, idx) => (
                <li key={idx}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
