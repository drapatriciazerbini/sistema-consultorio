begin;

/**
 * Valores de verdade e o pedido de visita em casa (24/09/2026).
 *
 * A Dra. Patrícia respondeu pelo WhatsApp o que faltava para o robô:
 *
 *  - Dois atendimentos, consultório e domicílio. Telemedicina não entrou na
 *    lista dela, então sai do robô (dá para religar em Preferências).
 *  - Consultório R$ 600,00 e domicílio R$ 800,00, os dois com retorno incluso.
 *  - Em casa ela vai no máximo até São Vicente. Mais longe, o valor sobe.
 *  - Antes de marcar a visita, importa saber onde é e se há restrição de dia
 *    ou horário.
 *
 * Por isso a visita deixa de ser marcada em horário da agenda: o robô anota o
 * endereço, os dias que não servem e quem é o paciente, e entrega o pedido
 * para a equipe confirmar dia, horário e valor. A coluna nova diz ao robô qual
 * unidade é a visita, em vez de ele adivinhar pelo nome.
 *
 * Os textos só são trocados onde ainda está o valor provisório de R$ 400,00
 * escrito em 23/09/2026. Se alguém já editou pela tela, a edição vale mais.
 */

-- ---------------------------------------------------------------
-- Qual unidade é a visita em casa
-- ---------------------------------------------------------------
--
-- clinic_units já tem grant de tabela inteira para authenticated e select
-- para service_role (20260824000100), e a RLS por clínica continua valendo
-- para a coluna nova. Nada a conceder aqui.

alter table public.clinic_units
  add column if not exists is_home_visit boolean not null default false;

comment on column public.clinic_units.is_home_visit is
  'Atendimento na casa do paciente. O robo nao oferece horario: anota endereco e restricoes e passa para a equipe confirmar.';

update public.clinic_units u
set is_home_visit = true
from public.clinics c
where c.id = u.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and u.archived_at is null
  and u.name = 'Visita domiciliar';

-- ---------------------------------------------------------------
-- Motivo de atenção novo: pediu visita em casa
-- ---------------------------------------------------------------
--
-- Se a função subir antes desta migration, o webhook já cai para
-- 'atendente' quando o banco recusa o motivo. Nada se perde, só a etiqueta
-- fica genérica.

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_attention_reason_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_attention_reason_check check (
    attention_reason is null
    or attention_reason in (
      'atendente', 'remarcacao', 'cancelamento', 'ajuda', 'falha', 'cancelou_sozinho',
      'urgencia', 'anexo', 'documento', 'farmacia', 'visita'
    )
  );

-- A MESMA lista de espera longa vive no webhook (ESPERA_LONGA). As duas
-- precisam concordar: pedido de visita feito sexta à noite ainda está
-- pendente no domingo, e o robô não pode voltar a saudar como se nada
-- tivesse sido pedido.
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
                          when attention_reason in ('anexo', 'ajuda', 'documento', 'farmacia', 'visita')
                            then interval '48 hours'
                          else interval '24 hours'
                        end
    returning 1
  )
  select count(*) into liberadas from alteradas;
  return liberadas;
end;
$$;

-- ---------------------------------------------------------------
-- Sem telemedicina, e o fecho sem "dia e horário"
-- ---------------------------------------------------------------
--
-- "escolha o atendimento, o dia e o horário" deixou de valer para a visita,
-- que não tem horário na agenda. replace() não mexe em nada se a frase já
-- foi trocada pela tela.

update public.clinic_settings cs
set telemedicine_enabled = false,
    whatsapp_menu_info_text = replace(
      cs.whatsapp_menu_info_text,
      'digite *2* e escolha o atendimento, o dia e o horário.',
      'digite *2* e escolha consultório ou visita em casa.'
    )
from public.clinics c
where c.id = cs.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini';

-- ---------------------------------------------------------------
-- Texto de cada atendimento
-- ---------------------------------------------------------------

update public.clinic_units u
set info_text =
  E'💚 *Consulta no consultório: R$ 600,00*, com retorno incluso.\n\n' ||
  E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.\n\n' ||
  E'📍 Rua Dr. Tolentino Filgueiras, 119, Gonzaga, Santos.\n\n' ||
  E'📋 Traga um documento com foto, os exames recentes, as receitas e a lista dos medicamentos em uso. Um familiar ou cuidador pode acompanhar.'
from public.clinics c
where c.id = u.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and u.archived_at is null
  and u.name = 'Consultório (Gonzaga)'
  and u.info_text like '%R$ 400,00%';

update public.clinic_units u
set info_text =
  E'💚 *Consulta em casa: R$ 800,00*, com retorno incluso.\n\n' ||
  E'🏠 A Dra. Patrícia vai até a casa do paciente em *Santos e São Vicente*. Em outras cidades a visita também é possível, com acréscimo no valor, informado antes de marcar.\n\n' ||
  E'🗓️ Para pedir a visita, digite *2*: anotamos o endereço e os dias que não servem, e a equipe confirma o dia e o horário.\n\n' ||
  E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.\n\n' ||
  E'📋 Separe os exames recentes, as receitas e a lista dos medicamentos em uso. Um familiar ou cuidador pode participar.\n\n' ||
  E'⚠️ A visita é um atendimento programado, não de emergência. Em emergência, ligue 192 (SAMU).'
from public.clinics c
where c.id = u.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and u.archived_at is null
  and u.name = 'Visita domiciliar'
  and u.info_text like '%R$ 400,00%';

-- ---------------------------------------------------------------
-- Respostas prontas
-- ---------------------------------------------------------------

update public.bot_answers b
set answer =
  E'💚 *Valores da consulta*, com retorno incluso:\n\n' ||
  E'• Consultório (Gonzaga): R$ 600,00\n' ||
  E'• Em casa, em Santos e São Vicente: R$ 800,00\n\n' ||
  E'🏠 Em outras cidades, a visita em casa tem acréscimo, informado antes de marcar.\n\n' ||
  E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.'
from public.clinics c
where c.id = b.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and b.subject = 'Valor e pagamento'
  and b.answer like '%R$ 400,00%';

update public.bot_answers b
set answer =
  E'🏠 *Consulta em casa*\n\n' ||
  E'A Dra. Patrícia atende em casa em *Santos e São Vicente*: R$ 800,00, com retorno incluso. Em outras cidades também é possível, com acréscimo no valor, informado antes de marcar.\n\n' ||
  E'Para pedir a visita, digite *2* e escolha *Visita domiciliar*: anotamos o endereço e a equipe confirma o dia e o valor.'
from public.clinics c
where c.id = b.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and b.subject = 'Região da visita domiciliar'
  and b.answer like '%Digite *9* e escreva o *bairro e a cidade*%';

-- Telemedicina saiu: as duas respostas que a citavam perdem só o trecho.
update public.bot_answers b
set answer = replace(b.answer, 'no consultório, em casa ou por telemedicina.', 'no consultório ou em casa.')
from public.clinics c
where c.id = b.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and b.subject = 'Idade atendida';

update public.bot_answers b
set answer = replace(b.answer, 'também atende em casa e por telemedicina.', 'também atende em casa, em Santos e São Vicente.')
from public.clinics c
where c.id = b.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and b.subject = 'Endereço do consultório';

commit;
