# Painel de Diagnóstico — Sr. Jorge

Painel de acompanhamento do diagnóstico estratégico de IA da Sr. Jorge. Vite + React + TypeScript, publicado no GitHub Pages, protegido por senha com criptografia AES-256-GCM no cliente (o conteúdo só existe em texto plano depois de decifrado no navegador com a senha correta — o repositório nunca contém o conteúdo em texto plano).

## Atualizar o conteúdo

O conteúdo (documentação de diagnóstico + roadmap + status) é gerado a partir da pasta `executions/src/diagnostico` do repositório de trabalho do cliente. Este repositório **não contém** essa pasta — apenas o blob já criptografado (`public/data.enc`).

Sempre que a documentação de diagnóstico mudar, rodar localmente (fora deste repo, a partir de uma máquina com acesso à pasta do cliente):

```bash
node scripts/build-content.mjs --src "<caminho para executions/src/diagnostico>" --out src/content/content.json
DASHBOARD_PASSWORD="<senha>" node scripts/encrypt-content.mjs
git add public/data.enc
git commit -m "chore: atualiza conteúdo do diagnóstico"
git push
```

O push para `main` dispara o deploy automático (GitHub Actions → GitHub Pages).

## Edições feitas no site

Documentos podem ser editados no próprio dashboard (botão **✎ Editar**). Cada edição é gravada cifrada, com a senha do dashboard, na tabela append-only `srjorge_doc_revisions` do Supabase, e aparece em **🕘 Histórico de edições**. As edições são aplicadas por cima do `data.enc`.

Para levar as edições de volta aos `.md` de origem:

```bash
DASHBOARD_PASSWORD="..." node scripts/export-revisions.mjs --src "<SrJorge>/executions/src/diagnostico" --dry-run  # confere
DASHBOARD_PASSWORD="..." node scripts/export-revisions.mjs --src "<SrJorge>/executions/src/diagnostico"
```

Depois, faça commit no repositório SrJorge e regenere o conteúdo como na seção anterior.

## Desenvolvimento local

```bash
npm install
node scripts/build-content.mjs --src "<caminho>" --out src/content/content.json
DASHBOARD_PASSWORD="<senha>" node scripts/encrypt-content.mjs
npm run dev
```

## Exportar o documento

Com um documento aberto no painel, o botão **⬇ Exportar** gera o arquivo em **Word (.docx)**, **PDF** ou **Markdown (.md)**. A geração acontece no navegador, com o texto que está na tela, incluindo edições feitas no site. Comentários não entram no arquivo.

- Word e PDF seguem as mesmas regras: títulos, listas (inclusive tarefas), tabelas com cabeçalho repetido, código, citações e links externos. Links entre documentos viram texto.
- No PDF, emoji são removidos e o painel informa quantos foram retirados; o Word mantém os emoji.
- O botão fica desabilitado durante a edição de um documento.
- Os módulos de Word e PDF só são baixados na primeira exportação em cada formato.
- As fontes do PDF são subsets da DejaVu (licença em `src/assets/pdf-fonts/LICENSE-DejaVu.txt`). A lista de caracteres que elas cobrem está em `src/lib/export/glyphs.ts`; `scripts/glyph-coverage.test.mjs` falha se a lista e as fontes divergirem.

## Testes

```bash
npm test                                   # unitários, estrutura dos arquivos e corpus da base documental
npm run lint
npm run build
npm run preview                            # em outro terminal
DASHBOARD_PASSWORD="..." npm run test:e2e  # abre o painel no Chrome instalado e valida os downloads
```

- `scripts/export.test.mjs`: Markdown exato, pacote .docx válido, texto extraível e paginação do PDF, tabelas longas, código, emoji e sanitização.
- `scripts/glyph-coverage.test.mjs`: as fontes embutidas cobrem os caracteres do fixture e de todos os documentos visíveis.
- `scripts/export-corpus.test.mjs`: exporta cada documento visível nos três formatos. Usa `DIAGNOSTICO_SRC` ou, se existir, `../SrJorge/executions/src/diagnostico`.
- `e2e/export.e2e.mjs`: fluxo completo no navegador. Para o site publicado, defina `E2E_BASE="https://iarketinglabs.github.io/srjorge-diagnostico-dashboard/"`. A senha vem só do ambiente e a pasta de saída `e2e/out/` não é versionada.
