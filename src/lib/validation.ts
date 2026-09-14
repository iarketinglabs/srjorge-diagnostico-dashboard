import type { ContentFile } from "./decrypt";
import { supabaseSelect, supabaseUpsert } from "./supabaseClient";
import { USERS, type UserName } from "./user";

export type Validation = {
  id: string;
  doc_path: string;
  user_name: UserName;
  checked: boolean;
  checked_at: string;
};

export type DocStatus = "validado" | "em-progresso" | "pendente";

/** README files, anything under a "Click Up AI (Brain 2)" folder, and the
 * recurring Lacunas / Roteiro de coleta / Perguntas pendentes working docs
 * (one per area, e.g. "lacunas.md", "roteiro-coleta-midia.md",
 * "perguntas-pendentes-gestao-mudanca.md") are internal working material,
 * not client-facing diagnostic content — excluded from validation entirely,
 * per the client's request. */
export function isValidatable(file: ContentFile): boolean {
  if (file.path.includes("Click Up AI (Brain 2)")) return false;
  const name = file.name.toLowerCase();
  if (name === "readme.md") return false;
  if (name.startsWith("lacunas")) return false;
  if (name.startsWith("roteiro-coleta")) return false;
  if (name.startsWith("perguntas-pendentes")) return false;
  return true;
}

export function computeDocStatus(checks: Validation[]): DocStatus {
  const checkedCount = new Set(checks.filter((c) => c.checked).map((c) => c.user_name)).size;
  if (checkedCount >= 3) return "validado";
  if (checkedCount >= 1) return "em-progresso";
  return "pendente";
}

export async function fetchAllValidations(): Promise<Validation[]> {
  return supabaseSelect<Validation>("srjorge_validations", "select=*");
}

export async function fetchValidationsForDoc(docPath: string): Promise<Validation[]> {
  return supabaseSelect<Validation>("srjorge_validations", `doc_path=eq.${encodeURIComponent(docPath)}`);
}

export async function setValidationCheck(docPath: string, userName: UserName, checked: boolean): Promise<void> {
  await supabaseUpsert("srjorge_validations", "doc_path,user_name", {
    doc_path: docPath,
    user_name: userName,
    checked,
    checked_at: new Date().toISOString(),
  });
}

export function groupValidationsByDoc(validations: Validation[]): Map<string, Validation[]> {
  const map = new Map<string, Validation[]>();
  for (const v of validations) {
    const list = map.get(v.doc_path) ?? [];
    list.push(v);
    map.set(v.doc_path, list);
  }
  return map;
}

export { USERS };
