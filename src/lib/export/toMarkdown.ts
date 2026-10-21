/** Markdown exportado é o corpo exato exibido no painel (já com edições do site), sem alterações. */
export function buildMarkdownBlob(body: string): Blob {
  return new Blob([body], { type: "text/markdown;charset=utf-8" });
}
