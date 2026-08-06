
import { useEffect, useRef } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: "ciano" | "amarelo" | "vermelho";
  atomId: number | null;
  role: "free" | "nucleus" | "electron";
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitRadiusTarget: number;
  inclination: number;
  ascendingNode: number;
  z: number;
  excitation: number;
  _depthScale: number;
  breakCooldown: number;
  driftAngle: number;  // direção de deriva suave — muda lentamente para simular flutuação
  trail: Array<{x: number; y: number}>;
};

type AtomInfo = {
  id: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  nucleusIds: number[];
  electronIds: number[];
};

const COLORS: Record<Particle["hue"], string> = {
  ciano:    "99, 190, 194",
  amarelo:  "255, 185, 0",    // amarelo âmbar saturado — maior contraste com fundo creme
  vermelho: "238, 110, 105",  // vermelho mais claro/rosado — menos contraste bruto com creme
};

// ── Física ────────────────────────────────────────────────────────────────────
const LJ_EQUILIBRIUM   = 10;     // px — distância de equilíbrio inter-núcleon
const LJ_EPSILON       = 0.012;  // força de ligação muito suave
const LJ_ATTRACT_MAX   = 38;     // px — alcance de atração LJ
const LJ_FORCE_CLAMP   = 0.12;   // força máxima por frame
const BOND_RADIUS      = 30;     // px — distância para pertencer ao mesmo átomo

const ORBIT_SPEED_MAX  = 0.006;  // rad/frame máximo
const ORBIT_BASE       = 28;     // px — raio base da primeira órbita
const ORBIT_SHELL_GAP  = 10;     // px — incremento por shell
const ORBIT_CONVERGE   = 0.005;  // lerp rate ao raio alvo

const PTR_RADIUS       = 155;    // px — raio de interação do ponteiro
const PTR_PUSH_FREE    = 0.10;   // impulso suave em partículas livres
const PTR_PUSH_NUCLEUS = 0.55;   // velocidade de ejeção dos núcleons
const PTR_PUSH_ELEC    = 0.30;   // velocidade de dispersão dos elétrons liberados
const PTR_BREAK_THRESH = 0.12;   // limiar para liberar elétrons da órbita

const BREAK_COOLDOWN   = 100;    // frames de cooldown após quebra do átomo

const ATOM_GRAVITY_G   = 35;     // constante gravitacional inter-átomo
const FUSION_APPROACH  = 130;    // px — range de atração entre átomos
const FUSION_MERGE     = 24;     // px — distância de fusão
const ATOM_GRAVITY_MAX = 0.012;  // aceleração máxima por gravidade

const ELEC_ATTRACT_G   = 0.00018;  // atração dos elétrons livres em direção a átomos
const ELEC_ATTRACT_MAX = 100;      // px — alcance dessa atração (órbitas mais próximas)
const ELEC_MASS_MAX    = 2.5;      // fator de massa máximo

const VEL_DAMPING      = 0.988;  // amortecimento mais forte — partículas freiam mais rápido
const EXCITATION_DECAY = 0.97;   // decaimento de excitação

// Deriva suave — partículas nunca ficam 100% paradas.
// Cada partícula tem uma direção de deriva que gira lentamente (onda senoidal),
// criando uma flutuação orgânica sem jitter aleatório.
const DRIFT_FORCE      = 0.0022; // magnitude da força de deriva (pixels/frame²)
const DRIFT_ROT_SPEED  = 0.008;  // rad/frame — velocidade de rotação da direção de deriva

const FORMATION_DELAY  = 4000;   // ms livres antes de atrações começarem
const FORMATION_RAMP   = 10000;  // ms para rampa 0→1

const TRAIL_LENGTH     = 550;    // pontos armazenados no rastro
const TRAIL_STEP_PX   = 0.8;    // distância mínima (px) entre pontos — garante comprimento uniforme

// FEAT-008 — fundo de partículas com física atômica gravitacional.
// Cianos (núcleons) formam núcleos; amarelos/vermelhos (elétrons) orbitam em plano 2D suave.
// Mouse/toque quebra o núcleo, espalhando as partículas suavemente.
export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasEl: HTMLCanvasElement = canvas;
    const context: CanvasRenderingContext2D = ctx;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    let pointer = { x: 0, y: 0, active: false };
    let agitation = 0;
    let scrollResetTimer: number | undefined;
    let rafId: number;
    let idCounter = 0;
    let startTime = 0;
    let formationFactor = 0;

    function particleCount() {
      return Math.max(50, Math.min(130, Math.round((width * height) / 10000)));
    }

    function createParticles() {
      idCounter = 0;
      const count = particleCount();
      // 28% ciano (núcleons), 72% elétrons (70% amarelos + 30% vermelhos)
      const cianoCount    = Math.round(count * 0.28);
      const elecTotal     = count - cianoCount;
      const amarelCount   = Math.round(elecTotal * 0.70);
      const vermelhoCount = elecTotal - amarelCount;

      const makeCiano = (): Particle => ({
        id: idCounter++,
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.03,
        vy: (Math.random() - 0.5) * 0.03,
        radius: Math.random() * 1.8 + 1.2, hue: "ciano",
        atomId: null, role: "free",
        orbitAngle: 0, orbitSpeed: 0,
        orbitRadius: 0, orbitRadiusTarget: 0,
        inclination: 0, ascendingNode: 0,
        z: 0, excitation: 0, _depthScale: 1,
        breakCooldown: 0,
        driftAngle: Math.random() * Math.PI * 2,
        trail: [],
      });

      const makeElec = (hue: "amarelo" | "vermelho"): Particle => ({
        id: idCounter++,
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.03,
        vy: (Math.random() - 0.5) * 0.03,
        radius: Math.random() * 1.2 + 0.8, hue,
        atomId: null, role: "free",
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: 0,
        orbitRadius: 0, orbitRadiusTarget: 0,
        inclination: 0, ascendingNode: 0,
        z: 0, excitation: 0, _depthScale: 1,
        breakCooldown: 0,
        driftAngle: Math.random() * Math.PI * 2,
        trail: [],
      });

      particles = [
        ...Array.from({ length: cianoCount },    makeCiano),
        ...Array.from({ length: amarelCount },   () => makeElec("amarelo")),
        ...Array.from({ length: vermelhoCount }, () => makeElec("vermelho")),
      ];
    }

    // Union-Find: agrupa cianos dentro de BOND_RADIUS no mesmo átomo.
    // Cianos com breakCooldown > 0 são ignorados — recém-liberados de um átomo quebrado.
    function buildAtoms(parts: Particle[], byId: Map<number, Particle>): Map<number, AtomInfo> {
      const cianos = parts.filter(p => p.hue === "ciano" && p.breakCooldown <= 0);
      const n = cianos.length;
      const parent = new Int32Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;

      function find(i: number): number {
        while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
        return i;
      }

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = cianos[i].x - cianos[j].x;
          const dy = cianos[i].y - cianos[j].y;
          if (dx * dx + dy * dy < BOND_RADIUS * BOND_RADIUS) {
            const ri = find(i); const rj = find(j);
            if (ri !== rj) {
              if (cianos[ri].id < cianos[rj].id) parent[rj] = ri;
              else parent[ri] = rj;
            }
          }
        }
      }

      const atomMap = new Map<number, AtomInfo>();
      for (let i = 0; i < n; i++) {
        const leaderId = cianos[find(i)].id;
        if (!atomMap.has(leaderId)) {
          atomMap.set(leaderId, { id: leaderId, cx: 0, cy: 0, vx: 0, vy: 0, nucleusIds: [], electronIds: [] });
        }
        const atom = atomMap.get(leaderId)!;
        atom.nucleusIds.push(cianos[i].id);
        cianos[i].atomId = leaderId;
        cianos[i].role = "nucleus";
      }

      // Cianos em cooldown permanecem "free"
      for (const p of parts) {
        if (p.hue === "ciano" && p.breakCooldown > 0) {
          p.atomId = null; p.role = "free";
        }
      }

      for (const atom of atomMap.values()) {
        let cx = 0, cy = 0, vx = 0, vy = 0;
        for (const nid of atom.nucleusIds) {
          const np = byId.get(nid)!;
          cx += np.x; cy += np.y; vx += np.vx; vy += np.vy;
        }
        const len = atom.nucleusIds.length;
        atom.cx = cx / len; atom.cy = cy / len;
        atom.vx = vx / len; atom.vy = vy / len;
      }

      // Valida elétrons já vinculados
      for (const p of parts) {
        if (p.hue === "ciano" || p.role !== "electron") continue;
        if (p.atomId !== null && atomMap.has(p.atomId)) {
          atomMap.get(p.atomId)!.electronIds.push(p.id);
        } else {
          p.atomId = null; p.role = "free";
        }
      }

      return atomMap;
    }

    // Atrai elétrons livres suavemente em direção ao átomo mais próximo.
    // A força escala com a massa do núcleo (número de núcleons) de forma progressiva
    // com teto em ELEC_MASS_MAX para preservar suavidade dos movimentos.
    function attractFreeElectrons(parts: Particle[], atoms: Map<number, AtomInfo>, ff: number) {
      if (ff < 0.01 || atoms.size === 0) return;
      for (const p of parts) {
        if (p.hue === "ciano" || p.role !== "free") continue;
        let bestDist = Infinity;
        let bestAtom: AtomInfo | null = null;
        for (const atom of atoms.values()) {
          const dx = atom.cx - p.x; const dy = atom.cy - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < ELEC_ATTRACT_MAX && d < bestDist) { bestDist = d; bestAtom = atom; }
        }
        if (bestAtom && bestDist > 1) {
          const dx = bestAtom.cx - p.x; const dy = bestAtom.cy - p.y;
          // Progressão suave por massa: 1 núcleon=1×, 2=1.35×, 3=1.7×... cap em ELEC_MASS_MAX
          const nucleusSize = bestAtom.nucleusIds.length;
          const massFactor = Math.min(ELEC_MASS_MAX, 1 + (nucleusSize - 1) * 0.35);
          const acc = ELEC_ATTRACT_G * ff * (1 - bestDist / ELEC_ATTRACT_MAX) * massFactor;
          p.vx += (dx / bestDist) * acc;
          p.vy += (dy / bestDist) * acc;
        }
      }
    }

    // Captura elétrons livres que chegaram perto o suficiente de um átomo.
    // Ao capturar, posiciona o elétron no plano orbital sem inclinação 3D,
    // garantindo que a posição inicial coincida com a posição real (sem teletransporte).
    function assignFreeElectrons(parts: Particle[], atoms: Map<number, AtomInfo>, ff: number) {
      if (ff < 0.01) return;
      for (const p of parts) {
        if (p.hue === "ciano" || p.role !== "free") continue;
        let bestDist = Infinity;
        let bestAtom: AtomInfo | null = null;
        for (const atom of atoms.values()) {
          const dx = p.x - atom.cx; const dy = p.y - atom.cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          const captureR = Math.min(ORBIT_BASE + ORBIT_SHELL_GAP * atom.electronIds.length + 12, 90);
          if (d < captureR && d < bestDist) { bestDist = d; bestAtom = atom; }
        }
        if (bestAtom && bestDist > 1) {
          const shellIdx = bestAtom.electronIds.length;
          p.atomId = bestAtom.id; p.role = "electron";
          p.orbitRadius = bestDist;
          p.orbitRadiusTarget = ORBIT_BASE + shellIdx * ORBIT_SHELL_GAP;

          // Plano orbital 3D — inclinação e nodo ascendente aleatórios por elétron,
          // simulando os orbitais s/p/d de um átomo real (cada um num plano diferente).
          p.inclination  = (Math.random() - 0.5) * Math.PI * 0.6; // ±54°
          p.ascendingNode = Math.random() * Math.PI * 2;

          // Projeta posição actual no novo plano orbital para calcular o ângulo
          // inicial — evita salto de posição visível ao momento da captura.
          const dx0 = p.x - bestAtom.cx; const dy0 = p.y - bestAtom.cy;
          const cosN = Math.cos(p.ascendingNode); const sinN = Math.sin(p.ascendingNode);
          const cosI = Math.cos(p.inclination);
          const projX =  dx0 * cosN + dy0 * sinN;
          const projY = (-dx0 * sinN + dy0 * cosN) / Math.max(Math.abs(cosI), 0.3);
          p.orbitAngle = Math.atan2(projY, projX);

          // Velocidade inversamente proporcional ao raio (3ª lei de Kepler):
          // elétrons internos orbitam mais rápido — fisicamente correcto.
          const speed = ORBIT_SPEED_MAX * Math.sqrt(ORBIT_BASE / p.orbitRadiusTarget);
          p.orbitSpeed = (Math.random() < 0.5 ? 1 : -1) * speed;

          p.excitation = 0;
          bestAtom.electronIds.push(p.id);
        }
      }
    }

    // Lennard-Jones intra-átomo + atração cruzada muito fraca (bootstrap).
    function applyLennardJones(parts: Particle[], atoms: Map<number, AtomInfo>, byId: Map<number, Particle>, ff: number) {
      const maxAttrStrain = LJ_ATTRACT_MAX - LJ_EQUILIBRIUM;

      for (const atom of atoms.values()) {
        const nids = atom.nucleusIds;
        for (let i = 0; i < nids.length; i++) {
          for (let j = i + 1; j < nids.length; j++) {
            const pi = byId.get(nids[i])!; const pj = byId.get(nids[j])!;
            const dx = pj.x - pi.x; const dy = pj.y - pi.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 0.25 || distSq > LJ_ATTRACT_MAX * LJ_ATTRACT_MAX) continue;
            const dist = Math.sqrt(distSq);
            const strain = dist - LJ_EQUILIBRIUM;
            let f: number;
            if (strain < 0) {
              f = LJ_EPSILON * (strain / LJ_EQUILIBRIUM);
            } else {
              const s = strain / maxAttrStrain;
              f = LJ_EPSILON * s * (1 - s) * 4;
            }
            f = Math.max(-LJ_FORCE_CLAMP, Math.min(LJ_FORCE_CLAMP, f)) * ff;
            pi.vx += (dx / dist) * f; pi.vy += (dy / dist) * f;
            pj.vx -= (dx / dist) * f; pj.vy -= (dy / dist) * f;
          }
        }
      }

      // Atração cruzada: puxa cianos livres/de outros átomos lentamente
      const cianos = parts.filter(p => p.hue === "ciano");
      const crossMaxR = 200;
      const crossStrength = 0.0001 * ff;
      for (let i = 0; i < cianos.length; i++) {
        for (let j = i + 1; j < cianos.length; j++) {
          const pi = cianos[i]; const pj = cianos[j];
          if (pi.atomId !== null && pi.atomId === pj.atomId) continue;
          const dx = pj.x - pi.x; const dy = pj.y - pi.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > crossMaxR * crossMaxR || distSq < LJ_EQUILIBRIUM * LJ_EQUILIBRIUM) continue;
          const dist = Math.sqrt(distSq);
          const acc = crossStrength * (1 - dist / crossMaxR);
          pi.vx += (dx / dist) * acc; pi.vy += (dy / dist) * acc;
          pj.vx -= (dx / dist) * acc; pj.vy -= (dy / dist) * acc;
        }
      }
    }

    function mergeAtoms(a: AtomInfo, b: AtomInfo, byId: Map<number, Particle>, atoms: Map<number, AtomInfo>) {
      if (!atoms.has(a.id) || !atoms.has(b.id)) return;
      const survivor = a.nucleusIds.length >= b.nucleusIds.length ? a : b;
      const absorbed  = survivor === a ? b : a;
      const mass = survivor.nucleusIds.length + absorbed.nucleusIds.length;
      const svx = (survivor.vx * survivor.nucleusIds.length + absorbed.vx * absorbed.nucleusIds.length) / mass;
      const svy = (survivor.vy * survivor.nucleusIds.length + absorbed.vy * absorbed.nucleusIds.length) / mass;

      for (const nid of absorbed.nucleusIds) {
        const np = byId.get(nid);
        if (np) { np.atomId = survivor.id; np.vx = svx; np.vy = svy; }
        survivor.nucleusIds.push(nid);
      }
      for (const nid of survivor.nucleusIds) {
        const np = byId.get(nid);
        if (np) { np.vx = svx; np.vy = svy; }
      }

      const allElec = [...survivor.electronIds, ...absorbed.electronIds];
      survivor.electronIds = [];
      allElec.forEach((eid, i) => {
        const ep = byId.get(eid);
        if (!ep) return;
        ep.atomId = survivor.id;
        ep.orbitRadiusTarget = ORBIT_BASE + i * ORBIT_SHELL_GAP;
        survivor.electronIds.push(eid);
      });

      atoms.delete(absorbed.id);
    }

    // Gravidade inter-átomo suave.
    function applyAtomGravity(atoms: Map<number, AtomInfo>, byId: Map<number, Particle>, ff: number) {
      if (atoms.size > 20 || ff < 0.01) return;
      const arr = Array.from(atoms.values());
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i]; const b = arr[j];
          if (!atoms.has(a.id) || !atoms.has(b.id)) continue;
          const dx = b.cx - a.cx; const dy = b.cy - a.cy;
          const distSq = dx * dx + dy * dy;
          if (distSq > FUSION_APPROACH * FUSION_APPROACH) continue;
          const dist = Math.sqrt(distSq);
          if (dist < 1) continue;
          if (dist < FUSION_MERGE) { mergeAtoms(a, b, byId, atoms); continue; }
          const totalMass = a.nucleusIds.length + b.nucleusIds.length;
          const acc = Math.min(ATOM_GRAVITY_MAX, (ATOM_GRAVITY_G / (distSq * totalMass)) * ff);
          const ax = (dx / dist) * acc; const ay = (dy / dist) * acc;
          for (const nid of a.nucleusIds) { const np = byId.get(nid); if (np) { np.vx += ax; np.vy += ay; } }
          for (const nid of b.nucleusIds) { const np = byId.get(nid); if (np) { np.vx -= ax; np.vy -= ay; } }
        }
      }
    }

    // Avança órbitas e projeta 3D → 2D.
    function updateElectrons(parts: Particle[], atoms: Map<number, AtomInfo>) {
      for (const p of parts) {
        if (p.role !== "electron") continue;
        if (p.atomId === null || !atoms.has(p.atomId)) {
          p.role = "free"; p.atomId = null; p._depthScale = 1; p.trail = [];
          p.vx = (Math.random() - 0.5) * 0.1; p.vy = (Math.random() - 0.5) * 0.1;
          continue;
        }
        // Regista posição apenas quando o elétron avançou TRAIL_STEP_PX píxeis —
        // assim todos os rastros têm o mesmo comprimento físico independentemente da velocidade.
        if (p.hue !== "ciano") {
          const prev = p.trail.length > 0 ? p.trail[p.trail.length - 1] : null;
          if (!prev) {
            p.trail.push({ x: p.x, y: p.y });
          } else {
            const dx = p.x - prev.x; const dy = p.y - prev.y;
            if (dx * dx + dy * dy >= TRAIL_STEP_PX * TRAIL_STEP_PX) {
              p.trail.push({ x: p.x, y: p.y });
              if (p.trail.length > TRAIL_LENGTH) p.trail.shift();
            }
          }
        }
        const atom = atoms.get(p.atomId)!;
        p.orbitAngle += p.orbitSpeed * (1 + p.excitation * 0.3);
        p.orbitRadius = Math.max(1, p.orbitRadius + (p.orbitRadiusTarget - p.orbitRadius) * ORBIT_CONVERGE);
        p.excitation *= EXCITATION_DECAY;
        if (agitation > 0.1) p.excitation = Math.min(1, p.excitation + agitation * 0.03);

        const r = p.orbitRadius;
        const cosA = Math.cos(p.orbitAngle); const sinA = Math.sin(p.orbitAngle);
        const cosI = Math.cos(p.inclination); const sinI = Math.sin(p.inclination);
        const cosN = Math.cos(p.ascendingNode); const sinN = Math.sin(p.ascendingNode);
        const xOrb = r * cosA;
        const yOrb = r * sinA * cosI;
        p.z = r * sinA * sinI;
        p.x = atom.cx + xOrb * cosN - yOrb * sinN;
        p.y = atom.cy + xOrb * sinN + yOrb * cosN;
        p._depthScale = 0.65 + 0.35 * ((p.z / r + 1) / 2);
      }
    }

    // Mouse/toque: partículas livres são afastadas suavemente;
    // qualquer contato com um núcleon quebra o átomo inteiro.
    // Núcleons recebem BREAK_COOLDOWN para evitar reagrupamento imediato
    // (que causaria o ciclo quebra/travamento dentro do raio do ponteiro).
    function applyPointerForces(parts: Particle[], atoms: Map<number, AtomInfo>, byId: Map<number, Particle>) {
      if (!pointer.active) return;
      const brokenAtoms = new Set<number>();

      for (const p of parts) {
        const dx = p.x - pointer.x; const dy = p.y - pointer.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > PTR_RADIUS * PTR_RADIUS || distSq < 0.01) continue;
        const dist = Math.sqrt(distSq);
        const proximity = 1 - dist / PTR_RADIUS;

        if (p.role === "nucleus" && p.atomId !== null && atoms.has(p.atomId)) {
          const atom = atoms.get(p.atomId)!;
          if (!brokenAtoms.has(atom.id)) {
            brokenAtoms.add(atom.id);

            for (const nid of atom.nucleusIds) {
              const np = byId.get(nid);
              if (!np) continue;
              np.atomId = null; np.role = "free"; np.excitation = 0.4;
              np.breakCooldown = BREAK_COOLDOWN;
              // Ejeção na direção ponteiro→núcleon (sempre para longe do cursor)
              const ndx = np.x - pointer.x; const ndy = np.y - pointer.y;
              const nd = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
              np.vx = (ndx / nd) * PTR_PUSH_NUCLEUS + (Math.random() - 0.5) * 0.3;
              np.vy = (ndy / nd) * PTR_PUSH_NUCLEUS + (Math.random() - 0.5) * 0.3;
            }

            for (const eid of atom.electronIds) {
              const ep = byId.get(eid);
              if (!ep) continue;
              ep.atomId = null; ep.role = "free"; ep._depthScale = 1; ep.excitation = 0.3; ep.trail = [];
              // Ejeção na direção ponteiro→elétron
              const edx = ep.x - pointer.x; const edy = ep.y - pointer.y;
              const ed = Math.sqrt(edx * edx + edy * edy) || 1;
              ep.vx = (edx / ed) * PTR_PUSH_ELEC + (Math.random() - 0.5) * 0.2;
              ep.vy = (edy / ed) * PTR_PUSH_ELEC + (Math.random() - 0.5) * 0.2;
            }

            atoms.delete(atom.id);
          }
        } else if (p.role === "electron") {
          p.excitation = Math.min(1, p.excitation + proximity * 0.4);
          if (proximity > PTR_BREAK_THRESH) {
            p.role = "free"; p.atomId = null; p._depthScale = 1; p.trail = [];
            p.vx = (dx / dist) * PTR_PUSH_ELEC * proximity;
            p.vy = (dy / dist) * PTR_PUSH_ELEC * proximity;
          }
        } else {
          // Partículas livres: repulsão suave
          p.vx += (dx / dist) * proximity * PTR_PUSH_FREE;
          p.vy += (dy / dist) * proximity * PTR_PUSH_FREE;
        }
      }
    }

    // Liquid glass moderado: cor suave e difusa, presença sutil sem competir com o conteúdo.
    function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
      const rgb = COLORS[p.hue];
      const isElec = p.role === "electron";
      const ds = isElec ? Math.max(0.65, p._depthScale) : 1;
      const r = p.radius * (isElec ? ds : 1);

      // Aura difusa — raio amplo, cor esfumaçada e contida
      const auraR = r * 18;
      const auraA = (isElec ? 0.062 : 0.038) * ds;
      const aura = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, auraR);
      aura.addColorStop(0,    `rgba(${rgb}, ${auraA.toFixed(4)})`);
      aura.addColorStop(0.32, `rgba(${rgb}, ${(auraA * 0.38).toFixed(4)})`);
      aura.addColorStop(1,    `rgba(${rgb}, 0)`);
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(p.x, p.y, auraR, 0, Math.PI * 2); ctx.fill();

      // Corpo frosted glass — branco central misturado com toque de cor suave
      const bodyR = r * 6.5;
      const bx = p.x - r * 0.22; const by = p.y - r * 0.22;
      const wA  = (0.22 * ds).toFixed(3);
      const cA  = ((isElec ? 0.20 : 0.12) * ds).toFixed(3);
      const cA2 = ((isElec ? 0.07 : 0.04) * ds).toFixed(3);
      const body = ctx.createRadialGradient(bx, by, 0, p.x, p.y, bodyR);
      body.addColorStop(0,    `rgba(255, 255, 255, ${wA})`);
      body.addColorStop(0.20, `rgba(${rgb}, ${cA})`);
      body.addColorStop(0.58, `rgba(${rgb}, ${cA2})`);
      body.addColorStop(1,    `rgba(${rgb}, 0)`);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(p.x, p.y, bodyR, 0, Math.PI * 2); ctx.fill();

      // Reflexo especular glass — difuso e discreto
      const sx = p.x - r * 0.58; const sy = p.y - r * 0.58;
      const specR = r * 1.8;
      const specA  = (0.30 * ds).toFixed(3);
      const specA2 = (0.05 * ds).toFixed(3);
      const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, specR);
      spec.addColorStop(0,    `rgba(255, 255, 255, ${specA})`);
      spec.addColorStop(0.52, `rgba(255, 255, 255, ${specA2})`);
      spec.addColorStop(1,    `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = spec;
      ctx.beginPath(); ctx.arc(sx, sy, specR, 0, Math.PI * 2); ctx.fill();
    }

    function drawNuclearBonds(ctx: CanvasRenderingContext2D, atoms: Map<number, AtomInfo>, byId: Map<number, Particle>) {
      ctx.strokeStyle = "rgba(99, 190, 194, 0.07)";
      ctx.lineWidth = 0.5;
      const bondDistSq = (LJ_EQUILIBRIUM * 2.4) ** 2;
      for (const atom of atoms.values()) {
        const nids = atom.nucleusIds;
        for (let i = 0; i < nids.length; i++) {
          for (let j = i + 1; j < nids.length; j++) {
            const pi = byId.get(nids[i]); const pj = byId.get(nids[j]);
            if (!pi || !pj) continue;
            const dx = pi.x - pj.x; const dy = pi.y - pj.y;
            if (dx * dx + dy * dy > bondDistSq) continue;
            ctx.beginPath(); ctx.moveTo(pi.x, pi.y); ctx.lineTo(pj.x, pj.y); ctx.stroke();
          }
        }
      }
    }

    // Rastro gunmetal fino e suave — segue a órbita dos elétrons amarelos e vermelhos.
    // Fade quadrático da cauda → ponta: invisível na extremidade, ~40% na mais recente.
    function drawTrail(ctx: CanvasRenderingContext2D, p: Particle) {
      const len = p.trail.length;
      if (len < 2) return;
      for (let i = 1; i < len; i++) {
        const t = i / len;                    // 0 = posição mais antiga, 1 = mais recente
        const alpha = t * t * 0.07;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(42, 52, 57, ${alpha.toFixed(4)})`;
        ctx.lineWidth = 0.15 + 0.5 * t;
        ctx.lineCap = "round";
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
      // Liga o fim do rastro à posição atual da partícula
      if (len >= 1) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(42, 52, 57, 0.07)";
        ctx.lineWidth = 0.65;
        ctx.lineCap = "round";
        ctx.moveTo(p.trail[len - 1].x, p.trail[len - 1].y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    function tick() {
      agitation *= 0.93;
      const speedMultiplier = 1 + agitation * 0.4;

      const elapsed = performance.now() - startTime;
      if (elapsed > FORMATION_DELAY) {
        formationFactor = Math.min(1, formationFactor + 16 / FORMATION_RAMP);
      }

      const byId = new Map<number, Particle>();
      for (const p of particles) byId.set(p.id, p);

      const atoms = buildAtoms(particles, byId);
      attractFreeElectrons(particles, atoms, formationFactor);
      assignFreeElectrons(particles, atoms, formationFactor);
      applyLennardJones(particles, atoms, byId, formationFactor);
      applyAtomGravity(atoms, byId, formationFactor);
      applyPointerForces(particles, atoms, byId);
      updateElectrons(particles, atoms);

      // Integra posições; aplica deriva suave para que nenhuma partícula fique parada.
      // A deriva é senoidal (DRIFT_ROT_SPEED) — orgânica e nunca oscila abruptamente.
      for (const p of particles) {
        if (p.role === "electron") continue;
        if (p.breakCooldown > 0) p.breakCooldown--;

        // Deriva flutuante: direção gira lentamente com variação individual
        p.driftAngle += DRIFT_ROT_SPEED * (0.7 + Math.random() * 0.6);
        p.vx += Math.cos(p.driftAngle) * DRIFT_FORCE;
        p.vy += Math.sin(p.driftAngle) * DRIFT_FORCE;

        p.vx *= VEL_DAMPING; p.vy *= VEL_DAMPING;
        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      }

      context.clearRect(0, 0, width, height);
      drawNuclearBonds(context, atoms, byId);

      // Painter's algorithm: elétrons atrás → núcleo → elétrons à frente
      const renderOrder = [...particles].sort((a, b) => {
        const az = a.role === "electron" ? a.z : 0;
        const bz = b.role === "electron" ? b.z : 0;
        return az - bz;
      });
      // Rastros desenhados primeiro — ficam sempre por baixo das partículas.
      // Só aparecem quando o núcleo tem ≥3 cianos (ligação estável de 3 partículas).
      for (const p of renderOrder) {
        if (p.role === "electron" && p.hue !== "ciano" &&
            p.atomId !== null && (atoms.get(p.atomId)?.nucleusIds.length ?? 0) >= 3) {
          drawTrail(context, p);
        }
      }
      for (const p of renderOrder) drawParticle(context, p);

      rafId = requestAnimationFrame(tick);
    }

    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasEl.width = width * dpr; canvasEl.height = height * dpr;
      canvasEl.style.width = `${width}px`; canvasEl.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      startTime = performance.now();
      formationFactor = 0;
      createParticles();
    }

    function onPointerMove(event: PointerEvent) {
      pointer = { x: event.clientX, y: event.clientY, active: true };
    }
    function onPointerLeave() { pointer.active = false; }
    function onScroll() {
      agitation = Math.min(1, agitation + 0.35);
      if (scrollResetTimer) window.clearTimeout(scrollResetTimer);
      scrollResetTimer = window.setTimeout(() => { agitation = 0; }, 900);
    }

    resize();
    rafId = requestAnimationFrame(tick);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("pointerup", onPointerLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      if (scrollResetTimer) window.clearTimeout(scrollResetTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="particle-stage" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="particle-vintage-overlay" />
    </div>
  );
}
