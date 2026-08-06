#!/usr/bin/env node
/**
 * Encrypts src/content/content.json with AES-256-GCM using a key derived
 * via PBKDF2-SHA256 (600k iterations) from DASHBOARD_PASSWORD.
 * Writes public/data.enc as base64 "salt:iv:ciphertext" — safe to commit,
 * it's ciphertext only. The password never touches this file or git history.
 *
 * Usage: DASHBOARD_PASSWORD="..." node scripts/encrypt-content.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ITERATIONS = 600_000;
const KEY_LEN = 32; // 256 bits
const SRC = path.resolve("src/content/content.json");
const OUT = path.resolve("public/data.enc");

const password = process.env.DASHBOARD_PASSWORD;
if (!password) {
  console.error("Missing DASHBOARD_PASSWORD env var.");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error(`Missing ${SRC} — run scripts/build-content.mjs first.`);
  process.exit(1);
}

const plaintext = fs.readFileSync(SRC, "utf-8");
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, "sha256");

const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
const authTag = cipher.getAuthTag();

// ciphertext payload = encrypted data + 16-byte GCM auth tag appended
const payload = Buffer.concat([encrypted, authTag]);

const out = {
  v: 1,
  iterations: ITERATIONS,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  data: payload.toString("base64"),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out), "utf-8");
console.log(`Encrypted ${plaintext.length} bytes -> ${OUT}`);
