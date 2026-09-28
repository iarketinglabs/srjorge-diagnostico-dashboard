#!/usr/bin/env node
/**
 * Traz as edições feitas no dashboard de volta para os .md de origem.
 * Busca a última revisão de cada documento em srjorge_doc_revisions,
 * decifra com DASHBOARD_PASSWORD (mesmo esquema de src/lib/crypto.ts) e
 * sobrescreve <src>/<doc_path>. Use --dry-run para só listar.
 *
 * Usage: DASHBOARD_PASSWORD="..." node scripts/export-revisions.mjs --src "<SrJorge>/executions/src/diagnostico" [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SUPABASE_URL = "https://eesxufjzpmrjdejaojtd.supabase.co";
const KEY = "sb_publishable_azmppB67Hwo4Py8OkG7pYQ_f1Zex_zh";
const SALT = "srjorge-doc-revisions-v1";
const ITERATIONS = 600_000;

const args = process.argv.slice(2);
const srcIdx = args.indexOf("--src");
const src = srcIdx >= 0 ? path.resolve(args[srcIdx + 1]) : null;
const dryRun = args.includes("--dry-run");
const password = process.env.DASHBOARD_PASSWORD;
if (!src || !password) {
  console.error('Usage: DASHBOARD_PASSWORD="..." node scripts/export-revisions.mjs --src <dir> [--dry-run]');
  process.exit(1);
}

const key = crypto.pbkdf2Sync(password, SALT, ITERATIONS, 32, "sha256");

function decryptText(stored) {
  if (stored == null || !stored.startsWith("enc1:")) return stored;
  const [ivB64, ctB64] = stored.slice(5).split(":");
  const buf = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]).toString("utf-8");
}

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/srjorge_doc_revisions?select=doc_path,author,created_at,body_after&order=created_at.desc`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
);
if (!res.ok) throw new Error(`Supabase: ${res.status} ${await res.text()}`);
const rows = await res.json();

const latest = new Map();
for (const r of rows) if (!latest.has(r.doc_path)) latest.set(r.doc_path, r);

let changed = 0;
for (const [docPath, rev] of latest) {
  const target = path.resolve(src, docPath);
  if (!target.startsWith(src + path.sep)) {
    console.warn(`! ignorado (fora de --src): ${docPath}`);
    continue;
  }
  let body;
  try {
    body = decryptText(rev.body_after);
  } catch {
    console.error("Falha ao decifrar — senha incorreta?");
    process.exit(1);
  }
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf-8") : null;
  if (current === body) continue;
  changed++;
  console.log(`${dryRun ? "[dry-run] " : ""}${docPath}  ← ${rev.author}, ${rev.created_at}`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, "utf-8");
  }
}
console.log(changed ? `${changed} arquivo(s) ${dryRun ? "a atualizar" : "atualizado(s)"}.` : "Nada a exportar: os .md já refletem as edições.");
