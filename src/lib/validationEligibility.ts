type ValidationCandidate = {
  path: string;
  name: string;
};

const EXCLUDED_DOCUMENT_NAMES = new Set([
  "indice-entregaveis.md",
  "matriz-evidencias.md",
  "registro-atualizacoes.md",
]);

/** Internal/working documents remain visible in the knowledge graph but do
 * not participate in validation progress. */
export function isValidationEligible(file: ValidationCandidate): boolean {
  const pathSegments = file.path.split(/[\\/]/);
  if (pathSegments.some((segment) => segment.toLowerCase() === "aios")) return false;
  if (file.path.includes("Click Up AI (Brain 2)")) return false;

  const name = file.name.toLowerCase();
  if (EXCLUDED_DOCUMENT_NAMES.has(name)) return false;
  if (name === "readme.md") return false;
  if (name.startsWith("lacunas")) return false;
  if (name.startsWith("roteiro-coleta")) return false;
  if (name.startsWith("perguntas-pendentes")) return false;
  return true;
}
