// Chave publishable (segura para expor no cliente): as tabelas srjorge_* aceitam
// SELECT/INSERT/UPDATE via RLS para o role anon — mesmo padrão já usado em
// docs/assets/js/supabase-client.js para este cliente. Sem policy de DELETE:
// "exclusão" nestas tabelas é sempre lógica (ver lib/comments.ts).
const SUPABASE_URL = "https://eesxufjzpmrjdejaojtd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_azmppB67Hwo4Py8OkG7pYQ_f1Zex_zh";

const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
};

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function supabaseSelect<T>(table: string, query: string): Promise<T[]> {
  return request<T[]>(`${table}?${query}`, {
    method: "GET",
    headers: { Prefer: "return=representation" },
  });
}

export function supabaseInsert<T>(table: string, body: Record<string, unknown>): Promise<T[]> {
  return request<T[]>(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

export function supabaseUpdate<T>(table: string, filterQuery: string, patch: Record<string, unknown>): Promise<T[]> {
  return request<T[]>(`${table}?${filterQuery}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

export function supabaseUpsert<T>(table: string, onConflict: string, body: Record<string, unknown>): Promise<T[]> {
  return request<T[]>(`${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
}
