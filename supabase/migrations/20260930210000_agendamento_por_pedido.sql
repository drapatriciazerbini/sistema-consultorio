begin;

/**
 * Agenda por pedido (30/09/2026).
 *
 * A agenda da Dra. Patricia muda toda semana, e a visita em casa ocupa o turno
 * inteiro. Ela confirma pessoalmente cada marcacao e nao quer que o paciente
 * escolha horario sozinho. Com agendamento_por_pedido ligado, o robo nao
 * oferece horario: anota primeira vez ou retorno, os periodos possiveis (tirados
 * dos Horarios de atendimento da unidade), restricoes de dia ou horario e a
 * partir de quando - e entrega o pedido para ela confirmar.
 *
 * Desligado (padrao), nada muda: o robo segue marcando pela agenda. Ligado para
 * a clinica deste banco, que e a da Dra. Patricia.
 *
 * O motivo de atencao novo, 'pedido_consulta', entra na lista de espera longa
 * (48h) junto com a visita: a MESMA lista vive no meta-webhook (ESPERA_LONGA).
 */

alter table public.clinic_settings
  add column if not exists agendamento_por_pedido boolean not null default false;

comment on column public.clinic_settings.agendamento_por_pedido is
  'Robo anota o pedido de consulta (periodos, restricoes) em vez de oferecer horario. A clinica confirma.';

update public.clinic_settings set agendamento_por_pedido = true;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_attention_reason_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_attention_reason_check check (
    attention_reason is null
    or attention_reason in (
      'atendente', 'remarcacao', 'cancelamento', 'ajuda', 'falha', 'cancelou_sozinho',
      'urgencia', 'anexo', 'documento', 'farmacia', 'visita', 'pedido_consulta'
    )
  );

create or replace function public.liberar_conversas_travadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  liberadas integer;
begin
  with alteradas as (
    update public.whatsapp_conversations
       set booking_state = null,
           booking_options = null,
           booking_unit_id = null,
           booking_modality = null,
           booking_patient_id = null,
           booking_replaces_id = null,
           booking_intake_id = null,
           booking_updated_at = now(),
           menu_sent_at = null,
           auto_replies_while_waiting = 0
     where booking_state is not null
       and coalesce(booking_updated_at, last_message_at, created_at)
             <= now() - case
                          when attention_reason in ('anexo', 'ajuda', 'documento', 'farmacia', 'visita', 'pedido_consulta')
                            then interval '48 hours'
                          else interval '24 hours'
                        end
    returning 1
  )
  select count(*) into liberadas from alteradas;
  return liberadas;
end;
$$;

revoke all on function public.liberar_conversas_travadas() from public, anon;
grant execute on function public.liberar_conversas_travadas() to authenticated, service_role;

commit;
