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
