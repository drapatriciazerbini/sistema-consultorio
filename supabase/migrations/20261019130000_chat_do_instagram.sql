begin;

/**
 * Chat do Direct na Central (19/10/2026).
 *
 * Pedido do Edu: ver a conversa do Instagram dentro da Central e, se precisar,
 * responder por la. O robo continua respondendo no Direct como antes; o que
 * muda e que o texto de cada mensagem passa a ficar guardado aqui (desde
 * 01/10/2026 nada era guardado de proposito, e a conversa so existia no
 * Business Suite). Historico comeca na publicacao desta mudanca.
 *
 * Quem grava e o servidor (meta-webhook e instagram-responder). A tela so le,
 * e so zera o contador de nao lidas.
 */

create table if not exists public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- pessoa: quem escreveu no Direct; robo: resposta automatica; equipe: Central,
  -- Business Suite ou app do Instagram.
  author text not null check (author in ('pessoa', 'robo', 'equipe')),
  body text not null default '',
  -- Id da Meta. Unico: o eco de uma mensagem ja gravada nao duplica.
  mid text unique,
  status text not null default 'enviada' check (status in ('recebida', 'enviada', 'falhou')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists instagram_messages_conversa_idx
  on public.instagram_messages (conversation_id, created_at);

alter table public.instagram_conversations
  add column if not exists unread_count integer not null default 0,
  add column if not exists last_message_at timestamptz;
create index if not exists instagram_conversations_recentes_idx
  on public.instagram_conversations (clinic_id, last_message_at desc);

alter table public.instagram_messages enable row level security;
alter table public.instagram_messages force row level security;

drop policy if exists instagram_messages_select_member on public.instagram_messages;
create policy instagram_messages_select_member on public.instagram_messages
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

-- A conversa, que ate aqui so o servidor via. A tela ve as colunas do chat,
-- coluna a coluna; o estado interno do robo fica de fora.
drop policy if exists instagram_conversations_select_member on public.instagram_conversations;
create policy instagram_conversations_select_member on public.instagram_conversations
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));
drop policy if exists instagram_conversations_update_member on public.instagram_conversations;
create policy instagram_conversations_update_member on public.instagram_conversations
  for update to authenticated
  using ((select private.is_clinic_member(clinic_id)))
  with check ((select private.is_clinic_member(clinic_id)));

revoke all on table public.instagram_messages from public, anon, authenticated;
grant select on table public.instagram_messages to authenticated;
grant select, insert, update on table public.instagram_messages to service_role;

grant select (id, clinic_id, first_name, last_inbound_at, last_human_reply_at, last_bot_reply_at,
  unread_count, last_message_at, created_at) on table public.instagram_conversations to authenticated;
grant update (unread_count) on table public.instagram_conversations to authenticated;

comment on table public.instagram_conversations is
  'Estado do robo do Instagram e cabecalho do chat do Direct na Central.';
comment on table public.instagram_messages is
  'Historico do Direct do Instagram (desde 19/10/2026), lido no chat da Central.';

commit;
