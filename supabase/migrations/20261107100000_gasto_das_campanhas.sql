begin;

/**
 * Quanto as campanhas custaram (07/11/2026, portado do sistema do Dr. Marcello).
 *
 * Pedido do Edu: "quero fazer o botao de campanha igual do Marcelo, que mostra
 * todo o gerenciamento com todos os indicadores". A aba Google da Visao geral
 * contava quem chegou pelo anuncio, mas nao o valor investido. Sem o gasto nao
 * ha custo por contato nem por consulta, que e o numero que decide se a
 * campanha continua.
 *
 * No sistema de origem isto veio em tres migrations (20261104200000,
 * 20261105100000 e 20261105140000); aqui chega numa so, ja com o que la foi
 * corrigido depois: o grant para o service_role (sem ele a funcao gastos-meta
 * nao gravava nada - "permission denied for table campanha_gastos") e as
 * colunas do Google automatico.
 *
 * Meta: a funcao gastos-meta le a conta de anuncios da Dra. de 3 em 3 horas
 * com um token so de leitura (ads_read), colado pelo Edu na aba Campanha. O
 * token de 60 dias e renovado pela propria funcao enquanto vale (ver
 * _shared/gastos-meta.ts).
 *
 * Google: um script do proprio Google Ads, colado pelo Edu na conta e
 * programado de hora em hora, manda o custo por dia para a funcao
 * gastos-google. A API do Google Ads ficou de fora: exige token de
 * desenvolvedor aprovado pelo Google. O valor lancado a mao continua para os
 * meses antes do script e para quando ele nao esta ligado.
 */
create table if not exists public.campanha_gastos (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  -- Conta de anuncios da Meta: o numero, sem o "act_".
  meta_conta text,
  meta_conta_nome text,
  -- So o servidor le (ver os grants abaixo): a tela nunca recebe o token.
  meta_token text,
  -- Nome de quem gerou o token no Facebook, para saber de quem pedir outro.
  meta_token_de text,
  meta_token_expira_em timestamptz,
  meta_token_renovado_em timestamptz,
  -- {"dias": {"2026-11-03": 21.4}, "anuncios": {"<id>": {"nome": "...", "dias": {...}}}}
  meta jsonb not null default '{}'::jsonb,
  meta_atualizado_em timestamptz,
  -- Falha barulhenta: a ultima busca recusada aparece na tela; os numeros
  -- antigos ficam (falhar nao pode zerar o investimento).
  meta_erro text,
  meta_erro_em timestamptz,
  -- Situacao da conta de anuncios, lida junto com o gasto: valor a pagar ate a
  -- proxima cobranca do cartao, conta bloqueada (cobranca recusada) e limite de
  -- gasto acabando. A conta da Dra. e pos-paga: nao ha credito para acabar, o
  -- que para os anuncios e isso (ver _shared/gastos-meta.ts, situacaoDaConta).
  meta_situacao jsonb,
  -- {"2026-10": 465.10}: gasto do Google no mes (no mes corrente, ate o dia do lancamento).
  google jsonb not null default '{}'::jsonb,
  google_atualizado_em timestamptz,
  google_atualizado_por uuid,
  -- {"desde": "2026-09-01", "ate": "2026-11-07", "dias": {"2026-11-03": 24.1},
  --  "campanhas": {"<id>": {"nome": "...", "dias": {...}}}}
  google_automatico jsonb not null default '{}'::jsonb,
  -- Ultimo relatorio aceito: sem noticia por horas, a tela avisa (o script pode ter parado).
  google_automatico_em timestamptz,
  google_conta text,
  -- Falha barulhenta: relatorio recusado ou erro avisado pelo script aparece na tela.
  google_erro text,
  google_erro_em timestamptz,
  -- So o sha-256 da chave do script, e so o servidor le (sem grant para a tela).
  google_chave_hash text,
  google_chave_criada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campanha_gastos_google_chave_hash
  on public.campanha_gastos (google_chave_hash) where google_chave_hash is not null;

comment on table public.campanha_gastos is
  'Investimento das campanhas: gasto da Meta (funcao gastos-meta) e do Google (script da conta pela funcao gastos-google, ou lancado a mao por mes).';
comment on column public.campanha_gastos.google_automatico is
  'Gasto do Google Ads por dia e por campanha, mandado pelo script da conta (funcao gastos-google).';
comment on column public.campanha_gastos.google_chave_hash is
  'sha-256 da chave do script do Google Ads. A chave em si so existe dentro do script colado na conta.';

alter table public.campanha_gastos enable row level security;
alter table public.campanha_gastos force row level security;

-- Dinheiro so para o dono da clinica. A recepcao continua vendo quem chegou e
-- quem marcou; o investimento fica em branco.
drop policy if exists campanha_gastos_select_owner on public.campanha_gastos;
create policy campanha_gastos_select_owner on public.campanha_gastos for select to authenticated
using ((select private.is_clinic_owner(clinic_id)));
drop policy if exists campanha_gastos_update_owner on public.campanha_gastos;
create policy campanha_gastos_update_owner on public.campanha_gastos for update to authenticated
using ((select private.is_clinic_owner(clinic_id))) with check ((select private.is_clinic_owner(clinic_id)));

revoke all on table public.campanha_gastos from public, anon, authenticated;

-- Coluna a coluna: meta_token e google_chave_hash ficam de fora de proposito.
grant select (clinic_id, meta_conta, meta_conta_nome, meta_token_de, meta_token_expira_em, meta_token_renovado_em,
  meta, meta_atualizado_em, meta_erro, meta_erro_em, meta_situacao, google, google_atualizado_em, google_atualizado_por,
  google_automatico, google_automatico_em, google_conta, google_erro, google_erro_em, google_chave_criada_em,
  created_at, updated_at) on table public.campanha_gastos to authenticated;
-- A tela so lanca o Google a mao; o resto quem grava sao as funcoes.
grant update (google, google_atualizado_em, google_atualizado_por, updated_at) on table public.campanha_gastos to authenticated;

-- Neste banco tabela nova nao nasce liberada para o servidor: no sistema de
-- origem a falta desta linha deixou a primeira conexao da Meta sem gravar.
grant all on table public.campanha_gastos to service_role;

-- Uma linha por clinica desde ja: update sem linha nao da erro, e o primeiro
-- lancamento do Google sumiria em silencio.
insert into public.campanha_gastos (clinic_id)
select id from public.clinics
on conflict (clinic_id) do nothing;

/**
 * Qual anuncio trouxe a familia: o source_id do bloco referral da Meta (so
 * quando source_type = 'ad'). Com ele a tela junta o gasto de cada anuncio a
 * quem ele trouxe. O titulo (origem_anuncio_titulo) nao serve de chave: dois
 * anuncios podem ter o mesmo titulo, e anuncio sem titulo existe.
 */
alter table public.whatsapp_conversations
  add column if not exists origem_anuncio_id text;

comment on column public.whatsapp_conversations.origem_anuncio_id is
  'Codigo do anuncio da Meta que trouxe a conversa (referral.source_id quando source_type = ad).';

-- Quem ja chegou: o referral esta guardado no evento do webhook.
with do_anuncio as (
  select distinct on (e.payload #>> '{change,value,messages,0,from}')
         e.payload #>> '{change,value,messages,0,from}' as wa_id,
         e.payload #>> '{change,value,messages,0,referral,source_id}' as anuncio
  from public.whatsapp_webhook_events e
  where e.event_kind = 'message'
    and e.payload #>> '{change,value,messages,0,referral,source_type}' = 'ad'
    and coalesce(e.payload #>> '{change,value,messages,0,referral,source_id}', '') <> ''
  order by e.payload #>> '{change,value,messages,0,from}', e.processed_at desc
)
update public.whatsapp_conversations c
set origem_anuncio_id = d.anuncio
from do_anuncio d
where c.wa_id = d.wa_id
  and c.origem_anuncio in ('instagram', 'facebook', 'meta')
  and c.origem_anuncio_id is null;

/**
 * De 3 em 3 horas, aos 15 minutos. Mesmo desenho do lembrete: segredo lido do
 * Vault dentro da funcao, os dois nomes aceitos, e a falta dele grita no log -
 * o lembrete ficou tres semanas parado por um erro de maiusculas que ninguem
 * via (20260923130000_consertar_segredo_do_lembrete).
 */
create or replace function private.disparar_gastos_meta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  segredo text;
begin
  select decrypted_secret into segredo
  from vault.decrypted_secrets
  where name in ('cron_secret', 'CRON_SECRET')
  order by case when name = 'cron_secret' then 0 else 1 end
  limit 1;

  if segredo is null then
    raise warning 'cron_secret ausente no Vault; gasto da Meta nao sera atualizado';
    return;
  end if;

  perform net.http_post(
    url := 'https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/gastos-meta'::text,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', segredo
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function private.disparar_gastos_meta() from public, anon, authenticated;

comment on function private.disparar_gastos_meta() is
  'Chama a Edge Function gastos-meta com o segredo do Vault. Avisa no log quando nao acha o segredo.';

select cron.unschedule('gastos-meta')
where exists (select 1 from cron.job where jobname = 'gastos-meta');

select cron.schedule(
  'gastos-meta',
  '15 */3 * * *',
  $$ select private.disparar_gastos_meta(); $$
);

commit;
