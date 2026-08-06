#!/usr/bin/env node
/**
 * Reads the SrJorge diagnostic markdown tree + hand-authored roadmap/status
 * data and produces a single content.json consumed by encrypt-content.mjs.
 *
 * Usage: node scripts/build-content.mjs --src "<path to executions/src/diagnostico>" --out src/content/content.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { src: null, out: "src/content/content.json" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--src") out.src = args[++i];
    if (args[i] === "--out") out.out = args[++i];
  }
  if (!out.src) {
    console.error("Usage: node scripts/build-content.mjs --src <diagnostico dir> [--out <file>]");
    process.exit(1);
  }
  return out;
}

function slugify(p) {
  return p.replace(/\\/g, "/");
}

function extractTitle(body, fallback) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function extractStatus(body) {
  // Looks for a top-of-file "**Status:** ..." line, or inline factual/hipótese/pendente tags.
  const m = body.match(/\*\*Status:\*\*\s*(.+)/);
  if (m) return m[1].trim();
  return null;
}

function countTags(body) {
  const factual = (body.match(/\bfactual\b/gi) || []).length;
  const hipotese = (body.match(/\bhip[oó]tese\b/gi) || []).length;
  const pendente = (body.match(/\bpendente\b/gi) || []).length;
  return { factual, hipotese, pendente };
}

function walk(dir, relBase) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const node = { name: path.basename(dir), path: slugify(relBase), type: "folder", children: [] };
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.join(relBase, entry.name);
    if (entry.isDirectory()) {
      const child = walk(abs, rel);
      node.children.push(child);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      node.children.push({ name: entry.name, path: slugify(rel), type: "file" });
    }
  }
  return node;
}

function collectFiles(dir, relBase, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.join(relBase, entry.name);
    if (entry.isDirectory()) {
      collectFiles(abs, rel, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const body = fs.readFileSync(abs, "utf-8");
      const title = extractTitle(body, entry.name.replace(/\.md$/, ""));
      const status = extractStatus(body);
      const tags = countTags(body);
      out.push({ path: slugify(rel), name: entry.name, title, status, tags, body });
    }
  }
}

// ── Roadmap: hand-authored from directives/presentations + directives/status-report.md ──
const roadmap = [
  {
    id: "fase-1",
    numero: 1,
    nome: "Diagnóstico Essencial",
    semanas: "Semanas 1–2",
    estadoAtual: "done",
    resumo:
      "Mapeamento operacional de gargalos, auditoria de cultura/fluência em IA, inventário de ferramentas, políticas de uso responsável e priorização de quick-wins.",
    entregavel: "Mapa de gargalos + roadmap de 6 meses (preliminar)",
    detalhes: [
      "Kickoff realizado em 08/07/2026 — Gate 0 concluído.",
      "Governança e AI Champions definidos: Cris (Mídia), Joana (Atendimento), Wesley (Design).",
      "Escopo formalizado (contrato assinado por e-signature em 23/07/2026).",
      "Entrevista 1 com liderança (Alexandre + Letícia) realizada em 23/07/2026.",
      "Acesso a Drive, ClickUp e Google Chat concedido e confirmado (04/08/2026).",
      "Pendente: consolidar Documento de Diagnóstico formal com baseline numérico.",
      "Pendente: análise de stack consolidada, estimativa de timeline, ICP negativo/deal-breakers.",
    ],
  },
  {
    id: "fase-2",
    numero: 2,
    nome: "Aprofundamento",
    semanas: "Semanas 3–5",
    estadoAtual: "pending",
    resumo:
      "Entrevistas individuais com o time (6-8 pessoas), mapeamento AS-IS de processos críticos, documentação e backlog de conhecimento.",
    entregavel: "Mapas de processo + backlog de documentação + tabela de COI por gargalo",
    detalhes: [
      "Pendente: validar fluxo ClickUp → Contentino → aprovação → entrega.",
      "Pendente: mapear fluxo comercial completo e indicadores de retenção/upsell.",
      "Pendente: documentar onboarding de novos clientes (briefing, criação de pastas/listas, kickoff, checkpoints).",
      "Pendente: mapear processo de atendimento (canais, handoffs, registros, critérios de qualidade).",
      "Pendente: aprofundar controle de horas contratadas e alerta antecipado (limiar de 70%).",
      "Sessões de coleta de Atendimento, Design e Mídia/Criação ainda sem evidência registrada.",
    ],
  },
  {
    id: "fase-3",
    numero: 3,
    nome: "Estratégico",
    semanas: "Semanas 6–7",
    estadoAtual: "pending",
    resumo:
      "Benchmark de maturidade em IA vs. agências de porte similar, plano de gestão de mudança, modelo de ROI com baseline e consolidação do roadmap de 12 meses.",
    entregavel: "Plano de gestão da mudança + modelo de ROI + roadmap de 12 meses",
    detalhes: ["Ainda não iniciado — depende da consolidação da Fase 2."],
  },
  {
    id: "fase-4",
    numero: 4,
    nome: "Entrega",
    semanas: "Semana 8 (meta: 16/09/2026)",
    estadoAtual: "pending",
    resumo: "Apresentação executiva dos achados consolidados à liderança.",
    entregavel: "Relatório consolidado + apresentação executiva",
    detalhes: ["Data-alvo definida no deck de kickoff: 16/09/2026. Nenhum marco intermediário fechado ainda."],
  },
  {
    id: "follow-up",
    numero: 5,
    nome: "Follow-up",
    semanas: "30–60 dias após a entrega",
    estadoAtual: "pending",
    resumo: "Checkpoint de validação: quick-wins adotados? plano de reinvestimento de tempo funcionando?",
    entregavel: "Ajuste de roadmap com base no que de fato aconteceu",
    detalhes: ["Ainda não iniciado."],
  },
];

const statusSnapshot = {
  atualizadoEm: "2026-08-06",
  faseGateAtual: "Fase 0: Diagnóstico (Gate 0: Kickoff concluído em 2026-07-08)",
  resumo:
    "O projeto permanece em Fase 0: Diagnóstico, com o Gate 0: Kickoff concluído em 2026-07-08. Há evidência real para os três passos do Gate 0: kickoff realizado, governança/champions definidos e escopo formalizado. Evidências recentes (novos tutoriais, entrevista de Letícia em 2026-08-04) não constituem aprovação do Documento de Diagnóstico nem avanço para a Fase 1.",
  proximosPassos: [
    "Validar fluxo ClickUp → Contentino → aprovação → entrega (permissões, handoffs, critérios de qualidade, fonte oficial do dashboard).",
    "Mapear fluxo comercial completo e indicadores de retenção/upsell, incluindo dependências de liderança.",
    "Documentar onboarding de novos clientes (briefing, criação de pastas/listas, kickoff, checkpoints).",
    "Mapear processo de atendimento — canais, handoffs, registros, critérios de qualidade.",
    "Aprofundar controle de horas contratadas e desenhar requisitos de alerta antecipado (limiar de 70%).",
    "Consolidar achados em Documento de Diagnóstico formal, incluindo baseline numérico e fronteira Humano vs. IA.",
    "Avançar itens da Fase 0 ainda sem evidência: análise de stack consolidada, estimativa de timeline, ICP negativo/deal-breakers.",
    "Validar/organizar acessos já concedidos (Drive, ClickUp, Google Chat) e materiais recebidos como fontes de diagnóstico.",
  ],
  bloqueios: [
    "Tutoriais contam como evidência operacional, não validação completa — permissões/nomes/métricas/conclusões precisam de confirmação em ambiente real.",
    "Documento de Diagnóstico ainda não consolidado — evidências dispersas entre entrevistas, diretrizes e materiais; falta síntese formal, baseline numérico e validações finais.",
    "Sessões de coleta de Atendimento, Design e Mídia/Criação ainda sem evidência registrada.",
    "Fatura enviada mas ainda não paga — fatura corrigida enviada em 30/07/2026, confirmação de pagamento pendente.",
    "Formulário de liderança de Letícia permanece rascunho — não deve ser usado para decisões nem para resolver divergências com a resposta do CFO.",
  ],
};

const { src, out } = parseArgs();
const srcAbs = path.resolve(src);
if (!fs.existsSync(srcAbs)) {
  console.error(`Source dir not found: ${srcAbs}`);
  process.exit(1);
}

const tree = walk(srcAbs, "");
const files = [];
collectFiles(srcAbs, "", files);

const content = {
  generatedAt: new Date().toISOString(),
  roadmap,
  statusSnapshot,
  docs: { tree, files },
};

const outAbs = path.resolve(out);
fs.mkdirSync(path.dirname(outAbs), { recursive: true });
fs.writeFileSync(outAbs, JSON.stringify(content, null, 2), "utf-8");
console.log(`Wrote ${files.length} docs to ${outAbs}`);
