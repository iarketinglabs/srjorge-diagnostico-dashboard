import type { ContentFile } from "./decrypt";

/**
 * Maps every suffix of every file's path (e.g. for "Operacoes/1.Comercial/as-is-comercial.md":
 * "as-is-comercial.md", "1.Comercial/as-is-comercial.md", "Operacoes/1.Comercial/as-is-comercial.md")
 * to that file's full path — but only when the suffix is unambiguous across the whole doc set.
 * This lets prose references like `as-is-comercial.md` or `` `README.md` `` resolve to a real
 * document when unique, while ambiguous bare names (many files are called README.md) are left
 * as plain text rather than risking a wrong navigation.
 */
export function buildPathIndex(files: ContentFile[]): Map<string, string> {
  const bySuffix = new Map<string, Set<string>>();
  for (const f of files) {
    const norm = f.path.replace(/\\/g, "/");
    const segments = norm.split("/");
    for (let i = 0; i < segments.length; i++) {
      const suffix = segments.slice(i).join("/");
      if (!bySuffix.has(suffix)) bySuffix.set(suffix, new Set());
      bySuffix.get(suffix)!.add(norm);
    }
  }
  const resolved = new Map<string, string>();
  for (const [suffix, paths] of bySuffix) {
    if (paths.size === 1) resolved.set(suffix, [...paths][0]);
  }
  return resolved;
}

export function resolveDocRef(ref: string, index: Map<string, string>): string | null {
  const norm = ref.trim().replace(/^\.\//, "").replace(/\\/g, "/");
  if (!norm.toLowerCase().endsWith(".md")) return null;
  return index.get(norm) ?? null;
}

/** Ancestor folder paths of a file or folder path, e.g. "A/B/c.md" -> ["A", "A/B"]. */
export function ancestorFolders(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const isFile = segments[segments.length - 1]?.toLowerCase().endsWith(".md");
  const folderSegments = isFile ? segments.slice(0, -1) : segments;
  const out: string[] = [];
  for (let i = 1; i <= folderSegments.length; i++) {
    out.push(folderSegments.slice(0, i).join("/"));
  }
  return out;
}
