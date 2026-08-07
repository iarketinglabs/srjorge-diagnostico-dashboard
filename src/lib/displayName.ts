import type { ContentTreeNode } from "./decrypt";

const DISPLAY_NAMES: Record<string, string> = {
  AIOS: "AIOS",
  Operacoes: "Operações",
  SrJorge: "Sr Jorge",
};

export function displaySegment(name: string, isFile: boolean): string {
  if (DISPLAY_NAMES[name]) return DISPLAY_NAMES[name];
  if (isFile) return name.replace(/\.md$/, "");
  // strip numeric prefixes like "1.Comercial" -> "Comercial"
  return name.replace(/^\d+\./, "");
}

export function displayName(node: ContentTreeNode): string {
  return displaySegment(node.name, node.type === "file");
}
