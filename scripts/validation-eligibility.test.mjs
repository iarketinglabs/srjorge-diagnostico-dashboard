import assert from "node:assert/strict";
import test from "node:test";

const { isValidationEligible } = await import("../src/lib/validationEligibility.ts").catch(() => ({
  isValidationEligible: null,
}));

const file = (path) => ({ path, name: path.split("/").at(-1) });

test("excludes only the requested documents from validation eligibility", () => {
  assert.equal(typeof isValidationEligible, "function", "validation eligibility filter is not implemented");

  assert.equal(isValidationEligible(file("indice-entregaveis.md")), false);
  assert.equal(isValidationEligible(file("Operacoes/matriz-evidencias.md")), false);
  assert.equal(isValidationEligible(file("registro-atualizacoes.md")), false);
  assert.equal(isValidationEligible(file("AIOS/roadmap-e-governanca.md")), false);
  assert.equal(isValidationEligible(file("AIOS/nested/detalhe.md")), false);
  assert.equal(isValidationEligible(file("Operacoes/processo.md")), true);
});
