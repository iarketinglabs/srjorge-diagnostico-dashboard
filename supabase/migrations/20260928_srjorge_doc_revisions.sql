-- Log auditável de edições de documentos (append-only).
-- Aplicada no projeto eesxufjzpmrjdejaojtd em 2026-09-28.
create table if not exists public.srjorge_doc_revisions (
  id uuid primary key default gen_random_uuid(),
  doc_path text not null,
  author text not null,
  created_at timestamptz not null default now(),
  body_before text not null,
  body_after text not null,
  summary text not null default '',
  base_revision_id uuid null references public.srjorge_doc_revisions(id)
);
create index if not exists srjorge_doc_revisions_doc_idx on public.srjorge_doc_revisions (doc_path, created_at desc);
alter table public.srjorge_doc_revisions enable row level security;
-- Somente SELECT/INSERT para anon: sem UPDATE/DELETE, o log é imutável pelo site.
create policy "anon select revisions" on public.srjorge_doc_revisions for select to anon using (true);
create policy "anon insert revisions" on public.srjorge_doc_revisions for insert to anon with check (true);
-- created_at é sempre o relógio do servidor, ignorando valor enviado pelo cliente.
create or replace function public.srjorge_doc_revisions_set_ts() returns trigger language plpgsql set search_path = '' as $$
begin new.created_at := now(); return new; end $$;
create trigger srjorge_doc_revisions_ts before insert on public.srjorge_doc_revisions for each row execute function public.srjorge_doc_revisions_set_ts();
