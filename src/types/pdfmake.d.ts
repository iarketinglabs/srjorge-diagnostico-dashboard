// pdfmake 0.3 não traz tipos para o build de navegador. A API usada é tipada em src/lib/export/engine.ts.
declare module "pdfmake/build/pdfmake" {
  const pdfmake: unknown;
  export default pdfmake;
}
