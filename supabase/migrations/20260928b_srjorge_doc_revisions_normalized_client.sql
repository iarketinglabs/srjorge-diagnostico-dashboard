-- body_before_normalized: versão anterior como o editor a serializa, para o diff
-- mostrar só a mudança do autor. client_info: id de dispositivo + user-agent.
-- Os campos body_* passam a ser gravados cifrados pelo cliente ("enc1:...").
alter table public.srjorge_doc_revisions
  add column if not exists body_before_normalized text,
  add column if not exists client_info jsonb;
