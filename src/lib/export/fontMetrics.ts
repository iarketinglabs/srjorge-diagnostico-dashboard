/**
 * Medição de texto com as métricas reais de um TrueType: lê as tabelas cmap, hmtx, hhea e head.
 * Serve para o layout de tabelas no PDF saber a largura exata da palavra mais longa de cada coluna;
 * estimativas por caractere subestimam letras maiúsculas e o pdfmake então expande a coluna.
 */
export type EmMeasurer = (text: string) => number;

export function createEmMeasurer(font: Uint8Array): EmMeasurer {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = readTableDirectory(view);
  const unitsPerEm = view.getUint16(tables.get("head")! + 18);
  const metricCount = view.getUint16(tables.get("hhea")! + 34);
  const hmtx = tables.get("hmtx")!;
  const glyphFor = readCmap(view, tables.get("cmap")!);

  const advance = (glyph: number): number => view.getUint16(hmtx + 4 * Math.min(glyph, metricCount - 1));

  return (text: string): number => {
    let units = 0;
    for (const ch of text) units += advance(glyphFor(ch.codePointAt(0) ?? 0));
    return units / unitsPerEm;
  };
}

function readTableDirectory(view: DataView): Map<string, number> {
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + 16 * i;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3)
    );
    tables.set(tag, view.getUint32(record + 8));
  }
  return tables;
}

/** Mapa codepoint → glifo a partir do subtable Unicode mais completo (formato 12, senão 4). */
function readCmap(view: DataView, base: number): (codePoint: number) => number {
  const count = view.getUint16(base + 2);
  let best: { offset: number; format: number } | null = null;
  for (let i = 0; i < count; i++) {
    const record = base + 4 + 8 * i;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = base + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode || (format !== 4 && format !== 12)) continue;
    if (!best || (format === 12 && best.format !== 12)) best = { offset, format };
  }
  if (!best) throw new Error("Fonte sem cmap Unicode utilizável");
  return best.format === 12 ? format12(view, best.offset) : format4(view, best.offset);
}

function format4(view: DataView, sub: number): (codePoint: number) => number {
  const segments = view.getUint16(sub + 6) / 2;
  const endCodes = sub + 14;
  const startCodes = endCodes + 2 * segments + 2;
  const deltas = startCodes + 2 * segments;
  const rangeOffsets = deltas + 2 * segments;
  return (codePoint) => {
    for (let i = 0; i < segments; i++) {
      if (codePoint > view.getUint16(endCodes + 2 * i)) continue;
      const start = view.getUint16(startCodes + 2 * i);
      if (codePoint < start) return 0;
      const delta = view.getInt16(deltas + 2 * i);
      const rangeOffset = view.getUint16(rangeOffsets + 2 * i);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = view.getUint16(rangeOffsets + 2 * i + rangeOffset + 2 * (codePoint - start));
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function format12(view: DataView, sub: number): (codePoint: number) => number {
  const groups = view.getUint32(sub + 12);
  return (codePoint) => {
    for (let i = 0; i < groups; i++) {
      const group = sub + 16 + 12 * i;
      const start = view.getUint32(group);
      const end = view.getUint32(group + 4);
      if (codePoint >= start && codePoint <= end) return view.getUint32(group + 8) + (codePoint - start);
    }
    return 0;
  };
}
