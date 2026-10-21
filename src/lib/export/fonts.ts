import sans from "../../assets/pdf-fonts/DejaVuSans.subset.ttf?url";
import sansBold from "../../assets/pdf-fonts/DejaVuSans-Bold.subset.ttf?url";
import sansOblique from "../../assets/pdf-fonts/DejaVuSans-Oblique.subset.ttf?url";
import sansBoldOblique from "../../assets/pdf-fonts/DejaVuSans-BoldOblique.subset.ttf?url";
import mono from "../../assets/pdf-fonts/DejaVuSansMono.subset.ttf?url";
import monoBold from "../../assets/pdf-fonts/DejaVuSansMono-Bold.subset.ttf?url";
import type { PdfFontBytes } from "./toPdf.ts";

const SOURCES: Record<string, string> = {
  "DejaVuSans.ttf": sans,
  "DejaVuSans-Bold.ttf": sansBold,
  "DejaVuSans-Oblique.ttf": sansOblique,
  "DejaVuSans-BoldOblique.ttf": sansBoldOblique,
  "DejaVuSansMono.ttf": mono,
  "DejaVuSansMono-Bold.ttf": monoBold,
};

let cached: Promise<PdfFontBytes> | null = null;

/** Fontes do PDF são baixadas só na primeira exportação em PDF e reaproveitadas depois. */
export function loadPdfFonts(): Promise<PdfFontBytes> {
  cached ??= Promise.all(
    Object.entries(SOURCES).map(async ([name, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fonte ${name} indisponível (${response.status})`);
      return [name, new Uint8Array(await response.arrayBuffer())] as const;
    })
  )
    .then((entries) => Object.fromEntries(entries))
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}
