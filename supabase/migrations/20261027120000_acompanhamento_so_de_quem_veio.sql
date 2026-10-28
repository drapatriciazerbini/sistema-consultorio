begin;

/**
 * Acompanhamento so de consulta que aconteceu.
 *
 * Quem marca pelo robo ganha ficha na hora, e a ficha cria sozinha uma
 * consulta vazia com a data do agendamento - e dela que penduram os
 * acompanhamentos de 15, 30 e 90 dias. No sistema do Dr. Marcello (23 a
 * 25/10/2026) o acompanhamento "como esta depois da consulta do dia X?" saiu
 * para quem cancelou ou faltou, e mesmo depois de o envio automatico passar a
 * segurar (_shared/consulta-aconteceu.ts) o acompanhamento continuava na tela:
 * eram 9 pacientes que nunca foram atendidos. O Edu: "nao pode entrar p
 * acompanhamento paciente que de fato nao gerou consulta, erro grave". Aqui o
 * caminho e o mesmo, e a filha que desmarca a consulta do pai nao pode
 * receber, um mes depois, a pergunta de como ele esta depois da consulta.
 *
 * A regra segue a agenda, num lugar so (robo, Agenda e a falta automatica das
 * 3h passam todos por aqui):
 *  - cancelou ou faltou, e nao sobrou outro horario do paciente naquele dia:
 *    a consulta VAZIA daquele dia e arquivada, e o gatilho
 *    consultations_sync_active arquiva os acompanhamentos dela junto (com o
 *    mesmo archived_at, e e por ele que a volta os acha);
 *  - desfez (clique errado, ou a medica escreveu o prontuario depois da falta
 *    automatica) e o paciente ficou sem consulta ativa: ela volta, com os
 *    acompanhamentos arquivados no mesmo instante;
 *  - a consulta marcada mudou de dia: a consulta vazia vai junto, e com ela
 *    as datas dos acompanhamentos.
 *
 * Arquiva a consulta, e nao so os acompanhamentos, de proposito: quando a
 * medica escreve o primeiro atendimento, o sistema reaproveita a consulta
 * vazia ATIVA (createConsultation). Com os acompanhamentos arquivados e a
 * consulta viva, o paciente que remarcasse e viesse ficaria sem
 * acompanhamento. Arquivada, o atendimento de verdade cria uma consulta nova,
 * com os acompanhamentos contados da data em que ele veio.
 *
 * Consulta assinada, ou com qualquer coisa escrita, nunca e mexida. "Vazia"
 * aqui e mais estrita que na origem (que olhava quatro campos): todo campo de
 * texto do prontuario, sem as marcas do editor, mais peso e altura - a mesma
 * conta de semConteudoClinico em src/lib/repository.ts, menos cid e unidade,
 * que a consulta vazia ja nasce copiando do cadastro. Arquivar um exame
 * fisico escrito por engano de agenda esconderia prontuario.
 *
 * Confere no destino: appointments (patient_id, clinic_id, status, starts_at,
 * enum appointment_status), consultations (consultation_date, signed_at,
 * archived_at, campos do prontuario), followups (consultation_id,
 * archived_at) e private.sync_active_consultation (20260908140100), que e
 * quem arquiva os acompanhamentos e recalcula os vencimentos.
 */

create or replace function private.acompanhamento_segue_a_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  dia date := (new.starts_at at time zone 'America/Sao_Paulo')::date;
  dia_antigo date := (old.starts_at at time zone 'America/Sao_Paulo')::date;
  volta_id uuid;
  volta_em timestamptz;
begin
  if new.patient_id is null then
    return new;
  end if;

  -- Cancelou ou faltou.
  if new.status in ('cancelled', 'no_show') and old.status not in ('cancelled', 'no_show') then
    if not exists (
      select 1 from public.appointments a
       where a.patient_id = new.patient_id
         and a.clinic_id = new.clinic_id
         and a.id <> new.id
         and a.status in ('scheduled', 'attended')
         and (a.starts_at at time zone 'America/Sao_Paulo')::date = dia
    ) then
      update public.consultations c
         set archived_at = now()
       where c.patient_id = new.patient_id
         and c.clinic_id = new.clinic_id
         and c.archived_at is null
         and c.consultation_date = dia
         -- Vazia de verdade (ver o cabecalho).
         and c.signed_at is null
         and c.weight_kg is null
         and c.height_cm is null
         and btrim(regexp_replace(
               coalesce(c.chief_complaint, '') || coalesce(c.clinical_history, '') ||
               coalesce(c.personal_history, '') || coalesce(c.family_history, '') ||
               coalesce(c.allergies, '') || coalesce(c.current_medications, '') ||
               coalesce(c.physical_exam, '') || coalesce(c.assessment, '') ||
               coalesce(c.plan, '') || coalesce(c.prescription, '') ||
               coalesce(c.return_plan, '') || coalesce(c.notes, ''),
               '<[^>]*>|&nbsp;', '', 'g')) = '';
    end if;
    return new;
  end if;

  -- Desfez a falta ou o cancelamento.
  if new.status in ('scheduled', 'attended') and old.status in ('cancelled', 'no_show') then
    if not exists (
      select 1 from public.consultations c
       where c.patient_id = new.patient_id
         and c.clinic_id = new.clinic_id
         and c.archived_at is null
    ) and exists (
      select 1 from public.patients p
       where p.id = new.patient_id and p.archived_at is null
    ) then
      select c.id, c.archived_at
        into volta_id, volta_em
        from public.consultations c
       where c.patient_id = new.patient_id
         and c.clinic_id = new.clinic_id
         and c.archived_at is not null
         and c.signed_at is null
         and c.consultation_date = dia
       order by c.archived_at desc
       limit 1;

      if volta_id is not null then
        update public.consultations set archived_at = null where id = volta_id;
        update public.followups
           set archived_at = null
         where consultation_id = volta_id
           and archived_at = volta_em;
      end if;
    end if;
    return new;
  end if;

  -- Mudou de dia e continua marcada: a consulta vazia vai junto.
  if new.status = 'scheduled' and dia is distinct from dia_antigo then
    update public.consultations c
       set consultation_date = dia
     where c.patient_id = new.patient_id
       and c.clinic_id = new.clinic_id
       and c.archived_at is null
       and c.consultation_date = dia_antigo
       -- Vazia de verdade (ver o cabecalho).
       and c.signed_at is null
       and c.weight_kg is null
       and c.height_cm is null
       and btrim(regexp_replace(
             coalesce(c.chief_complaint, '') || coalesce(c.clinical_history, '') ||
             coalesce(c.personal_history, '') || coalesce(c.family_history, '') ||
             coalesce(c.allergies, '') || coalesce(c.current_medications, '') ||
             coalesce(c.physical_exam, '') || coalesce(c.assessment, '') ||
             coalesce(c.plan, '') || coalesce(c.prescription, '') ||
             coalesce(c.return_plan, '') || coalesce(c.notes, ''),
             '<[^>]*>|&nbsp;', '', 'g')) = '';
  end if;

  return new;
end
$function$;

revoke all on function private.acompanhamento_segue_a_agenda() from public, anon, authenticated;

drop trigger if exists appointments_acompanhamento_segue_a_agenda on public.appointments;
create trigger appointments_acompanhamento_segue_a_agenda
after update of status, starts_at on public.appointments
for each row execute function private.acompanhamento_segue_a_agenda();

commit;
