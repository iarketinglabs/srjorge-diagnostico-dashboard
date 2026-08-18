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
      { status: "done", text: "Kickoff realizado em 08/07/2026 — Gate 0 concluído." },
      { status: "done", text: "Governança e AI Champions definidos: Cris (Mídia), Joana (Atendimento), Wesley (Design)." },
      { status: "done", text: "Escopo formalizado (contrato assinado por e-signature em 23/07/2026)." },
      { status: "done", text: "Entrevista 1 com liderança (Alexandre + Letícia) realizada em 23/07/2026." },
      { status: "done", text: "Acesso a Drive, ClickUp e Google Chat concedido e confirmado (04/08/2026)." },
      { status: "pending", text: "Consolidar Documento de Diagnóstico formal com baseline numérico." },
      { status: "pending", text: "Análise de stack consolidada, estimativa de timeline, ICP negativo/deal-breakers." },
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
      { status: "done", text: "Fluxos preliminares de Comercial, onboarding de clientes, Atendimento e Recrutamento/Onboarding documentados com fontes primárias." },
      { status: "done", text: "Reuniões dedicadas de Comercial, Atendimento e Recrutamento/Onboarding mineradas; AS-IS permanecem preliminares quando falta validação do executor." },
      { status: "done", text: "Controle de horas e requisitos de alerta antecipado aprofundados; piloto e reconciliação com dados de sistema seguem pendentes." },
      { status: "pending", text: "Validar os fluxos preliminares com executores e registros reais do ClickUp, Drive e ferramentas de operação." },
      { status: "pending", text: "Consolidar baselines comparáveis de volume, esforço, custo e resultado antes de COI, ROI ou priorização final." },
      { status: "pending", text: "Concluir as coletas dedicadas de Design, Mídia e Conteúdo." },
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
    detalhes: [{ status: "pending", text: "Ainda não iniciado — depende da consolidação da Fase 2." }],
  },
  {
    id: "fase-4",
    numero: 4,
    nome: "Entrega",
    semanas: "Semana 8 (meta: 16/09/2026)",
    estadoAtual: "pending",
    resumo: "Apresentação executiva dos achados consolidados à liderança.",
    entregavel: "Relatório consolidado + apresentação executiva",
    detalhes: [
      { status: "done", text: "Data-alvo definida no deck de kickoff: 16/09/2026." },
      { status: "pending", text: "Nenhum marco intermediário fechado ainda." },
    ],
  },
  {
    id: "follow-up",
    numero: 5,
    nome: "Follow-up",
    semanas: "30–60 dias após a entrega",
    estadoAtual: "pending",
    resumo: "Checkpoint de validação: quick-wins adotados? plano de reinvestimento de tempo funcionando?",
    entregavel: "Ajuste de roadmap com base no que de fato aconteceu",
    detalhes: [{ status: "pending", text: "Ainda não iniciado." }],
  },
];

const statusSnapshot = {
  atualizadoEm: "2026-08-18",
  faseGateAtual: "Fase 2: Aprofundamento em andamento",
  resumo:
    "A Fase 2 está em andamento. Comercial, Atendimento e Recrutamento/Onboarding receberam rodadas dedicadas de evidência; a base agora reúne fluxos AS-IS preliminares, gargalos e lacunas rastreáveis. Nenhum baseline, COI, ROI, score de maturidade ou priorização final foi fechado sem os dados exigidos.",
  proximosPassos: [
    "Validar Comercial, Atendimento e Recrutamento/Onboarding com executores e registros reais, preservando o status preliminar até então.",
    "Receber e analisar os materiais pendentes de recrutamento: transcrições de fit, perfis Sólides, job tests, ficha ClickUp e apresentação de integração.",
    "Reconstruir controles de horas e testar os requisitos de alerta antecipado antes de recomendar automação.",
    "Concluir coletas de Design, Mídia e Conteúdo e consolidar baselines comparáveis.",
    "Consolidar o Documento de Diagnóstico formal somente após as validações e baselines necessários.",
  ],
  bloqueios: [
    "Tutoriais contam como evidência operacional, não validação completa — permissões/nomes/métricas/conclusões precisam de confirmação em ambiente real.",
    "Documento de Diagnóstico ainda não consolidado — evidências dispersas entre entrevistas, diretrizes e materiais; falta síntese formal, baseline numérico e validações finais.",
    "AS-IS de áreas já mapeadas continuam preliminares até validação por executor e registro operacional; relatos de liderança não substituem essa etapa.",
    "Design, Mídia e Conteúdo ainda requerem coletas dedicadas ou validações adicionais para fechamento de seus AS-IS.",
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
