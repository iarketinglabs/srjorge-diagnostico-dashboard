import { plainText } from "./normalize.ts";
import type { Inline } from "./types.ts";

/**
 * Largura mínima de cada coluna: a palavra mais larga dela, medida por `minimumOf`
 * (com a fonte e as margens de quem renderiza). Abaixo disso a coluna não comporta a palavra.
 */
export function minimumWidths(
  head: Inline[][],
  rows: Inline[][][],
  columns: number,
  minimumOf: (word: string) => number
): number[] {
  return Array.from({ length: columns }, (_, col) => {
    const cells = [head[col] ?? [], ...rows.map((row) => row[col] ?? [])];
    return Math.max(0, ...cells.flatMap(unbreakableWords).map(minimumOf));
  });
}

/**
 * Larguras de coluna que somam `total`. Cada coluna recebe ao menos o seu mínimo, para que
 * termos como "EV-198" ou datas não sejam quebrados no meio. O restante do espaço é dividido
 * pelo peso do conteúdo de cada coluna. Se os mínimos não couberem no total, a tabela
 * precisa de fonte menor (quem chama decide com `minimumWidths`).
 */
export function layoutColumns(
  head: Inline[][],
  rows: Inline[][][],
  columns: number,
  total: number,
  minimumOf: (word: string) => number
): number[] {
  if (columns === 0) return [];
  const fractions = columnFractions(head, rows, columns);
  const minimums = minimumWidths(head, rows, columns, minimumOf);

  const pinned = new Array<boolean>(columns).fill(false);
  let widths: number[];
  for (;;) {
    const pinnedSpace = minimums.reduce((acc, min, col) => (pinned[col] ? acc + min : acc), 0);
    const freeSpace = total - pinnedSpace;
    const freeFraction = fractions.reduce((acc, fraction, col) => (pinned[col] ? acc : acc + fraction), 0);
    if (freeFraction === 0 || freeSpace <= 0) {
      widths = minimums;
      break;
    }
    widths = fractions.map((fraction, col) => (pinned[col] ? minimums[col] : (fraction / freeFraction) * freeSpace));
    const violator = widths.findIndex((width, col) => !pinned[col] && width < minimums[col]);
    if (violator < 0) break;
    pinned[violator] = true;
  }

  // Mínimos que não cabem no total: encolhe proporcionalmente para não estourar a tabela.
  const sum = widths.reduce((acc, width) => acc + width, 0);
  return sum > total ? widths.map((width) => (width * total) / sum) : widths;
}

/**
 * Fração da largura total de cada coluna, proporcional ao texto da coluna
 * e limitada para que colunas curtas não encolham demais nem a longa domine.
 */
export function columnFractions(head: Inline[][], rows: Inline[][][], columns: number): number[] {
  const weights = Array.from({ length: columns }, (_, col) => {
    const cells = [head[col] ?? [], ...rows.map((row) => row[col] ?? [])];
    const average = cells.reduce((sum, content) => sum + plainText(content).length, 0) / cells.length;
    return Math.min(Math.max(average, 6), 40);
  });
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  return weights.map((weight) => weight / sum);
}

/**
 * Trechos que o layout não quebra: espaço e barra são pontos de quebra, e hífen só quebra
 * antes de letra (um ID como "EV-198" ou uma data "2026-09-23" fica inteiro).
 */
export function unbreakableWords(content: Inline[]): string[] {
  return plainText(content)
    .split(/\s+|\/|-(?=\D)/)
    .filter((word) => word.length > 0);
}
