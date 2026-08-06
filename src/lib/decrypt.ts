export type ContentFile = {
  path: string;
  name: string;
  title: string;
  status: string | null;
  tags: { factual: number; hipotese: number; pendente: number };
  body: string;
};

export type ContentTreeNode = {
  name: string;
  path: string;
  type: "folder" | "file";
  children?: ContentTreeNode[];
};

export type RoadmapStage = {
  id: string;
  numero: number;
  nome: string;
  semanas: string;
  estadoAtual: "done" | "in-progress" | "pending";
  resumo: string;
  entregavel: string;
  detalhes: string[];
};

export type StatusSnapshot = {
  atualizadoEm: string;
  faseGateAtual: string;
  resumo: string;
  proximosPassos: string[];
  bloqueios: string[];
};

export type DashboardContent = {
  generatedAt: string;
  roadmap: RoadmapStage[];
  statusSnapshot: StatusSnapshot;
  docs: { tree: ContentTreeNode; files: ContentFile[] };
};

type EncryptedPayload = {
  v: number;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
};

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class WrongPasswordError extends Error {}

export async function decryptContent(password: string, payload: EncryptedPayload): Promise<DashboardContent> {
  const enc = new TextEncoder();
  const salt = b64ToBytes(payload.salt);
  const iv = b64ToBytes(payload.iv);
  const data = b64ToBytes(payload.data);

  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: payload.iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  try {
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    const json = new TextDecoder().decode(plainBuf);
    return JSON.parse(json) as DashboardContent;
  } catch {
    throw new WrongPasswordError("Senha incorreta.");
  }
}

export async function fetchEncryptedPayload(): Promise<EncryptedPayload> {
  const res = await fetch(`${import.meta.env.BASE_URL}data.enc`);
  if (!res.ok) throw new Error("Não foi possível carregar os dados.");
  return res.json();
}
