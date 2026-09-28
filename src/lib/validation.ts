import type { ContentFile } from "./decrypt";
import { supabaseSelect, supabaseUpsert } from "./supabaseClient";
import { USERS, type UserName } from "./user";
import { isValidationEligible } from "./validationEligibility";

export type Validation = {
  id: string;
  doc_path: string;
  user_name: UserName;
  checked: boolean;
  checked_at: string;
};

export type DocStatus = "validado" | "em-progresso" | "pendente";

/** Eligibility is narrower than graph visibility: working/index documents
 * remain readable in the knowledge base while staying out of validation. */
export const isValidatable = (file: ContentFile): boolean => isValidationEligible(file);

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
