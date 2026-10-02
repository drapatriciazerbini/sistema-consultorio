begin;

/**
 * Robô também no Direct do Instagram (01/10/2026).
 *
 * Os anúncios do Instagram começaram a rodar em 01/10/2026 e as perguntas
 * chegam pelo Direct: valor, convênio, consulta em casa. O Edu pediu o mesmo
 * robô do WhatsApp respondendo lá.
 *
 * O Direct não tem telefone, e o agendamento do robô depende dele (é pelo
 * telefone que se acha o paciente e se manda o lembrete). Por isso, no
 * Instagram o robô responde as dúvidas com as MESMAS respostas prontas da tela
 * "Respostas do robô" e leva quem quer marcar para o WhatsApp do consultório.
 *
 * O meta-webhook recebe os dois: o objeto 'whatsapp_business_account' segue
 * como antes, e o objeto 'instagram' cai em _shared/instagram.ts.
 *
 * O que fica guardado aqui é só o necessário para o robô saber quando falar:
 * nenhum texto de mensagem. A conversa inteira continua na caixa de entrada do
 * Meta Business Suite, que é onde a equipe já responde o Instagram.
 */

-- ---------------------------------------------------------------
-- Qual conta do Instagram é de qual clínica
-- ---------------------------------------------------------------
--
-- clinic_settings tem select de tabela inteira para service_role
-- (20260823193000), que cobre a coluna nova. Para authenticated nada é
-- concedido: a tela não precisa ver nem trocar este número.

alter table public.clinic_settings
  add column if not exists instagram_account_ids text[] not null default '{}';

create index if not exists clinic_settings_instagram_accounts_idx
  on public.clinic_settings using gin (instagram_account_ids);

comment on column public.clinic_settings.instagram_account_ids is
  'Ids da conta profissional do Instagram desta clinica, como chegam nos avisos da Meta (entry.id, recipient.id). A Meta usa ids diferentes conforme o tipo de login do app, por isso mais de um.';

-- @drapatriciazerbini: 17841423757585617 (conta profissional) e
-- 1300277496510020 (id da conta no Business Suite).
update public.clinic_settings cs
set instagram_account_ids = array['17841423757585617', '1300277496510020']
from public.clinics c
where c.id = cs.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and cs.instagram_account_ids = '{}';

-- ---------------------------------------------------------------
-- Estado de cada conversa do Direct
-- ---------------------------------------------------------------

create table if not exists public.instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  -- Id da pessoa no Instagram (IGSID). Não é o @, e só vale para esta conta.
  ig_user_id text not null,
  last_inbound_at timestamptz,
  -- Quando o robô respondeu, e o id da última mensagem dele: o eco que a Meta
  -- devolve com este id é do robô, qualquer outro eco é de gente da equipe.
  last_bot_reply_at timestamptz,
  last_bot_message_id text,
  -- Quando alguém da equipe respondeu (pelo Business Suite ou pelo app). O
  -- robô fica calado por um tempo depois disso.
  last_human_reply_at timestamptz,
  -- Respostas seguidas do robô sem ninguém da equipe no meio. Passando do
  -- teto, ele para de responder até a equipe entrar.
  bot_replies_in_row integer not null default 0,
  menu_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (clinic_id, ig_user_id)
);

alter table public.instagram_conversations enable row level security;
alter table public.instagram_conversations force row level security;
revoke all on public.instagram_conversations from public, anon, authenticated;
grant select, insert, update on public.instagram_conversations to service_role;

comment on table public.instagram_conversations is
  'Quando o robo do Instagram pode falar. Sem texto de mensagem: a conversa fica no Meta Business Suite.';

commit;
