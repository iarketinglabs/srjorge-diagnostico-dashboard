// Cifra os textos das revisões com a mesma senha do dashboard (a que abre o
// data.enc), para que o Supabase só guarde ciphertext. Formato:
// "enc1:<iv base64>:<ciphertext+tag base64>" — compatível com node:crypto
// (aes-256-gcm, tag de 16 bytes anexada), usado por scripts/export-revisions.mjs.
export const SESSION_PASSWORD_KEY = "srjorge-dashboard-unlocked";
export const REVISIONS_SALT = "srjorge-doc-revisions-v1";
export const REVISIONS_ITERATIONS = 600_000;
const PREFIX = "enc1:";

let keyPromise: Promise<CryptoKey> | null = null;
let keyPassword: string | null = null;

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function getKey(): Promise<CryptoKey> {
  const password = sessionStorage.getItem(SESSION_PASSWORD_KEY);
  if (!password) return Promise.reject(new Error("Sessão expirada: entre novamente com a senha."));
  if (keyPromise && keyPassword === password) return keyPromise;
  keyPassword = password;
  const enc = new TextEncoder();
  keyPromise = crypto.subtle
    .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
    .then((baseKey) =>
      crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode(REVISIONS_SALT), iterations: REVISIONS_ITERATIONS, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      )
    );
  return keyPromise;
}

export async function encryptText(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `${PREFIX}${bytesToB64(iv)}:${bytesToB64(ct)}`;
}

/** Linhas antigas (anteriores à cifragem) estão em texto claro e são devolvidas como estão. */
export async function decryptText(stored: string | null): Promise<string | null> {
  if (stored === null || !stored.startsWith(PREFIX)) return stored;
  const [ivB64, ctB64] = stored.slice(PREFIX.length).split(":");
  const key = await getKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivB64!) }, key, b64ToBytes(ctB64!));
  return new TextDecoder().decode(plain);
}
