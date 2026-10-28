-- Teste da regra "acompanhamento so de quem veio" (migration
-- 20261027120000_acompanhamento_so_de_quem_veio.sql). Porte do teste do
-- sistema do Dr. Marcello, de 25/10/2026.
--
-- Rodar no SQL Editor do Supabase DEPOIS que a migration estiver aplicada.
-- Usa um paciente de mentira na primeira unidade cadastrada e TERMINA COM
-- ERRO DE PROPOSITO: o erro desfaz tudo, e a mensagem dele traz o resultado.
-- Nada fica gravado.
--
-- Esperado:
--   1 inicio: acomp 3
--   2 mudou 2 dias: consulta +2, vencimentos +2 tambem
--   3 cancelou: arquivada true acomp 0
--   4 desfez: arquivada false acomp 3
--   5 falta auto: arquivada true
--   6 prontuario depois: consultas ativas 1, acomp ativos 3, esqueleto arquivado true
--   7 cancelou com prontuario: consultas ativas 1
--   8 so exame fisico escrito: cancelou e continua ativa (arquivada false)
-- Sem a regra, o passo 3 da "arquivada false acomp 3" - o defeito da origem.

begin;

do $teste$
declare
  clinica uuid; unidade uuid; pac uuid; pac2 uuid; ag uuid; ag2 uuid; esq uuid; esq2 uuid; r text := '';
  dia0 date := current_date + 10;
begin
  select u.clinic_id, u.id into strict clinica, unidade
    from public.clinic_units u where u.archived_at is null order by u.created_at limit 1;
  insert into public.patients (clinic_id, name, phone, consultation_date, sex)
    values (clinica, 'Teste do gatilho', '13900000000', dia0, 'O') returning id into pac;
  select id into strict esq from public.consultations where patient_id = pac;
  r := r || '1 inicio: acomp ' || (select count(*) from public.followups where consultation_id = esq and archived_at is null) || ' / ';
  insert into public.appointments (clinic_id, unit_id, patient_id, starts_at, ends_at, status)
    values (clinica, unidade, pac, (dia0 + time '14:00') at time zone 'America/Sao_Paulo', (dia0 + time '14:40') at time zone 'America/Sao_Paulo', 'scheduled') returning id into ag;
  update public.appointments set starts_at = starts_at + interval '2 days', ends_at = ends_at + interval '2 days' where id = ag;
  r := r || '2 mudou 2 dias: consulta +' || ((select consultation_date from public.consultations where id = esq) - dia0) || ' venc ' || (select string_agg(followup_key::text || ' +' || (due_date - dia0), ' ') from public.followups where consultation_id = esq and archived_at is null) || ' / ';
  update public.appointments set status = 'cancelled' where id = ag;
  r := r || '3 cancelou: arquivada ' || (select archived_at is not null from public.consultations where id = esq) || ' acomp ' || (select count(*) from public.followups where consultation_id = esq and archived_at is null) || ' / ';
  update public.appointments set status = 'scheduled' where id = ag;
  r := r || '4 desfez: arquivada ' || (select archived_at is not null from public.consultations where id = esq) || ' acomp ' || (select count(*) from public.followups where consultation_id = esq and archived_at is null) || ' / ';
  update public.appointments set status = 'no_show', no_show_automatico_em = now() where id = ag;
  r := r || '5 falta auto: arquivada ' || (select archived_at is not null from public.consultations where id = esq) || ' / ';
  insert into public.consultations (clinic_id, patient_id, consultation_date, encounter_type, chief_complaint)
    values (clinica, pac, dia0 + 2, 'initial', 'tontura ao levantar');
  update public.appointments set status = 'attended', no_show_automatico_em = null where id = ag;
  r := r || '6 prontuario depois: consultas ativas ' || (select count(*) from public.consultations where patient_id = pac and archived_at is null) || ' acomp ativos ' || (select count(*) from public.followups where patient_id = pac and archived_at is null) || ' esqueleto arquivado ' || (select archived_at is not null from public.consultations where id = esq) || ' / ';
  update public.appointments set status = 'cancelled' where id = ag;
  r := r || '7 cancelou com prontuario: consultas ativas ' || (select count(*) from public.consultations where patient_id = pac and archived_at is null) || ' / ';

  -- Mais estrito que a origem: so o exame fisico escrito ja nao e "vazia".
  insert into public.patients (clinic_id, name, phone, consultation_date, sex)
    values (clinica, 'Teste do gatilho 2', '13900000001', dia0, 'O') returning id into pac2;
  select id into strict esq2 from public.consultations where patient_id = pac2;
  update public.consultations set physical_exam = 'PA 130x80' where id = esq2;
  insert into public.appointments (clinic_id, unit_id, patient_id, starts_at, ends_at, status)
    values (clinica, unidade, pac2, (dia0 + time '15:00') at time zone 'America/Sao_Paulo', (dia0 + time '15:40') at time zone 'America/Sao_Paulo', 'scheduled') returning id into ag2;
  update public.appointments set status = 'cancelled' where id = ag2;
  r := r || '8 so exame fisico: arquivada ' || (select archived_at is not null from public.consultations where id = esq2);
  raise exception 'RESULTADO % FIM', r;
end
$teste$;

commit;
