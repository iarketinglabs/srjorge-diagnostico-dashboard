import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(scriptDir, "build-content.mjs");

function flattenTree(node) {
  return [node.path, ...(node.children ?? []).flatMap(flattenTree)];
}

test("keeps validation-ineligible documents available to the knowledge graph", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "srjorge-dashboard-content-"));
  const sourceDir = path.join(tempDir, "diagnostico");
  const outputFile = path.join(tempDir, "content.json");

  try {
    fs.mkdirSync(path.join(sourceDir, "AIOS", "nested"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "Operacoes"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "indice-entregaveis.md"), "# Indice", "utf8");
    fs.writeFileSync(path.join(sourceDir, "Operacoes", "matriz-evidencias.md"), "# Matriz", "utf8");
    fs.writeFileSync(path.join(sourceDir, "registro-atualizacoes.md"), "# Registro", "utf8");
    fs.writeFileSync(path.join(sourceDir, "AIOS", "roadmap.md"), "# Roadmap", "utf8");
    fs.writeFileSync(path.join(sourceDir, "AIOS", "nested", "detalhe.md"), "# Detalhe", "utf8");
    fs.writeFileSync(path.join(sourceDir, "Operacoes", "processo.md"), "# Processo", "utf8");

    const result = spawnSync(
      process.execPath,
      [buildScript, "--src", sourceDir, "--out", outputFile],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const content = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    const filePaths = content.docs.files.map((file) => file.path);
    const treePaths = flattenTree(content.docs.tree);

    assert.deepEqual(filePaths, [
      "AIOS/nested/detalhe.md",
      "AIOS/roadmap.md",
      "indice-entregaveis.md",
      "Operacoes/matriz-evidencias.md",
      "Operacoes/processo.md",
      "registro-atualizacoes.md",
    ]);
    assert.equal(treePaths.some((entry) => entry === "AIOS"), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("hides the executive presentation source and its HTML companions from the dashboard", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "srjorge-dashboard-content-"));
  const sourceDir = path.join(tempDir, "diagnostico");
  const outputFile = path.join(tempDir, "content.json");

  try {
    fs.mkdirSync(path.join(sourceDir, "Entregaveis", "ApresentacaoExecutiva", "html"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "Entregaveis", "ApresentacaoExecutiva", "apresentacao-executiva-final.md"), "# Apresentação", "utf8");
    fs.writeFileSync(path.join(sourceDir, "Entregaveis", "ApresentacaoExecutiva", "html", "apresentacao-executiva.html"), "<html></html>", "utf8");
    fs.writeFileSync(path.join(sourceDir, "Entregaveis", "ApresentacaoExecutiva", "README.md"), "# Leia-me", "utf8");
    fs.writeFileSync(path.join(sourceDir, "Entregaveis", "outro-entregavel.md"), "# Outro", "utf8");

    const result = spawnSync(process.execPath, [buildScript, "--src", sourceDir, "--out", outputFile], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    const content = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    const filePaths = content.docs.files.map((file) => file.path);
    const treePaths = flattenTree(content.docs.tree);

    assert.deepEqual(filePaths, ["Entregaveis/outro-entregavel.md"]);
    assert.equal(treePaths.some((entry) => entry.endsWith("apresentacao-executiva-final.md")), false);
    assert.equal(treePaths.some((entry) => entry.endsWith(".html")), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
