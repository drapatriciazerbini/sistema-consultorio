-- Chave do Instagram recusada pela Meta (03/11/2026).
--
-- De 31/10 a 03/11/2026 o robo do Direct nao respondeu ninguem: a Meta
-- invalidou o INSTAGRAM_PAGE_TOKEN ("the user changed their password or
-- Facebook has changed the session for security reasons") e toda resposta
-- voltava 401. A Central marcava "nao enviada" em conversas que ninguem abria,
-- e nenhum aviso saiu. Quem percebeu foi o Edu, achando que os anuncios novos
-- tinham subido sem o robo. Ver avisarChaveRecusada em _shared/instagram.ts.
--
-- instagram_chave_recusada_em: a ultima vez que o robo viu a chave recusada e
-- avisou a equipe (no maximo a cada 12 horas). Volta a null na primeira
-- resposta que sai. A Central mostra a faixa vermelha enquanto estiver
-- preenchida.
--
-- alertas_de_urgencia.motivo ganha 'sistema': o aviso no WhatsApp da Dra. e do
-- Edu pelo modelo aviso_sistema_central (MODELOS-META.md, item 9).

begin;

alter table public.clinic_settings
  add column if not exists instagram_chave_recusada_em timestamptz;

comment on column public.clinic_settings.instagram_chave_recusada_em is
  'Ultima vez que a Meta recusou a chave do Instagram (INSTAGRAM_PAGE_TOKEN) e a equipe foi avisada. Null: robo do Direct respondendo.';

-- O robo grava pelo service_role, que so tinha select no clinic_settings.
-- A leitura da Central vem do select de tabela inteira do authenticated.
grant update (instagram_chave_recusada_em) on table public.clinic_settings to service_role;

alter table public.alertas_de_urgencia
  drop constraint if exists alertas_de_urgencia_motivo_check;
alter table public.alertas_de_urgencia
  add constraint alertas_de_urgencia_motivo_check
  check (motivo in ('urgencia', 'pedido', 'duvida', 'sistema'));

commit;
