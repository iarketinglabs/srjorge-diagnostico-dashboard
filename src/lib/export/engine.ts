import type { PdfEngine } from "./toPdf.ts";

/** pdfmake no navegador exporta a instância como default, às vezes encapsulada em outro default. */
export async function loadPdfEngine(): Promise<PdfEngine> {
  const mod = await import("pdfmake/build/pdfmake");
  const exported = mod.default;
  if (isEngine(exported)) return exported;
  if (hasDefault(exported) && isEngine(exported.default)) return exported.default;
  throw new Error("Não foi possível carregar o gerador de PDF.");
}

function isEngine(value: unknown): value is PdfEngine {
  return typeof value === "object" && value !== null && "createPdf" in value;
}

function hasDefault(value: unknown): value is { default: unknown } {
  return typeof value === "object" && value !== null && "default" in value;
}
