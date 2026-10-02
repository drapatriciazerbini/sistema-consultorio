begin;

/**
 * Números do Instagram na Visão geral (02/10/2026).
 *
 * O Edu pediu uma terceira aba, ao lado de "Base clínica" e "WhatsApp", com o
 * que acontece no Direct: quantas pessoas escreveram, o que perguntaram, o que
 * o robô resolveu sozinho e o que sobrou para a equipe.
 *
 * Mesmo desenho de whatsapp_bot_events: uma linha por coisa que aconteceu,
 * sem texto de mensagem (a conversa continua só no Meta Business Suite). O
 * detalhe é um rótulo curto escolhido pelo robô: o assunto da resposta pronta,
 * o botão tocado, o motivo de chamar a equipe.
 *
 * Os números só existem a partir desta migration. Antes dela o robô não
 * registrava nada além do estado da conversa, e a tela avisa isso.
 */

create table if not exists public.instagram_bot_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  evento text not null,
  detalhe text not null default '',
  criado_em timestamptz not null default now(),
  constraint instagram_bot_events_evento_valido check (evento in (
    'mensagem',          -- a pessoa escreveu ou tocou num botão
    'anuncio',           -- a mensagem veio de um anúncio (quando a Meta informa)
    'botao',             -- detalhe = payload do botão (VALOR, AGENDAR...)
    'menu',              -- robô mandou a apresentação ou "Claro! Sobre o que..."
    'resposta',          -- detalhe = assunto da resposta pronta enviada
    'agendar',           -- pediu para marcar; equipe avisada
    'equipe',            -- detalhe = pediu | saude | nao_entendeu
    'agradecimento',     -- "Por nada!"
    'equipe_respondeu'   -- alguém da equipe escreveu na conversa
  )),
  constraint instagram_bot_events_detalhe_curto check (char_length(detalhe) <= 80)
);

comment on table public.instagram_bot_events is
  'O que aconteceu em cada conversa do Direct, para contagem na Visao geral. Nao guarda texto de mensagem.';

create index if not exists instagram_bot_events_clinica_data
  on public.instagram_bot_events (clinic_id, criado_em desc);
create index if not exists instagram_bot_events_conversa
  on public.instagram_bot_events (conversation_id, criado_em);

alter table public.instagram_bot_events enable row level security;
alter table public.instagram_bot_events force row level security;

revoke all on table public.instagram_bot_events from public, anon, authenticated;

-- A tela conta pela função abaixo; quem escreve é só o robô (service_role).
-- Leitura direta coluna a coluna para membro da clínica, para conferência.
drop policy if exists instagram_bot_events_select_member on public.instagram_bot_events;
create policy instagram_bot_events_select_member on public.instagram_bot_events
for select to authenticated using ((select private.is_clinic_member(clinic_id)));

grant select (id, clinic_id, conversation_id, evento, detalhe, criado_em)
  on table public.instagram_bot_events to authenticated;
grant select, insert on table public.instagram_bot_events to service_role;

-- ---------------------------------------------------------------------------

create or replace function public.numeros_do_instagram(
  p_clinic uuid,
  p_de timestamptz,
  p_ate timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resposta jsonb;
begin
  if not (select private.is_clinic_member(p_clinic)) then
    raise exception 'Sem acesso aos numeros desta clinica.';
  end if;

  with ev as (
    select e.conversation_id, e.evento, e.detalhe, e.criado_em
    from public.instagram_bot_events e
    where e.clinic_id = p_clinic
      and e.criado_em >= p_de and e.criado_em < p_ate
  ),
  conversas as (
    select distinct conversation_id from ev where evento = 'mensagem'
  ),
  primeira as (
    select conversation_id, min(criado_em) as quando
    from ev where evento = 'mensagem' group by conversation_id
  ),
  chamaram as (
    select distinct conversation_id from ev
    where evento in ('agendar', 'equipe', 'equipe_respondeu')
  )
  select jsonb_build_object(
    'contatos', (select count(*) from conversas),
    'novos', (select count(*) from public.instagram_conversations c
              where c.clinic_id = p_clinic and c.created_at >= p_de and c.created_at < p_ate),
    'mensagens', (select count(*) from ev where evento = 'mensagem'),
    'respostas_robo', (select count(*) from ev where evento in ('menu', 'resposta', 'agendar', 'equipe', 'agradecimento')),
    'resolvidas', (select count(*) from conversas c where not exists (select 1 from chamaram x where x.conversation_id = c.conversation_id)),
    'pediram_agendar', (select count(distinct conversation_id) from ev where evento = 'agendar'),
    'equipe_respondeu', (select count(distinct conversation_id) from ev where evento = 'equipe_respondeu'),
    'do_anuncio', (select count(distinct conversation_id) from ev where evento = 'anuncio'),
    'fora_do_horario', (select count(*) from primeira p
      where extract(isodow from p.quando at time zone 'America/Sao_Paulo') >= 6
         or extract(hour from p.quando at time zone 'America/Sao_Paulo') < 8
         or extract(hour from p.quando at time zone 'America/Sao_Paulo') >= 18),
    'assuntos', coalesce((select jsonb_object_agg(detalhe, n) from
       (select detalhe, count(*) as n from ev where evento = 'resposta' and detalhe <> '' group by detalhe) a), '{}'::jsonb),
    'botoes', coalesce((select jsonb_object_agg(detalhe, n) from
       (select detalhe, count(*) as n from ev where evento = 'botao' and detalhe <> '' group by detalhe) b), '{}'::jsonb),
    'equipe_por_motivo', coalesce((select jsonb_object_agg(detalhe, n) from
       (select case when evento = 'agendar' then 'agendar' else detalhe end as detalhe, count(*) as n
        from ev where evento in ('agendar', 'equipe') group by 1) m), '{}'::jsonb)
  ) into resposta;

  return resposta;
end;
$$;

comment on function public.numeros_do_instagram(uuid, timestamptz, timestamptz) is
  'Indicadores do robo no Direct do Instagram num periodo. Conta no banco pelo mesmo motivo do WhatsApp: o PostgREST corta em 1000 linhas.';

revoke all on function public.numeros_do_instagram(uuid, timestamptz, timestamptz) from public;
grant execute on function public.numeros_do_instagram(uuid, timestamptz, timestamptz) to authenticated;

commit;
