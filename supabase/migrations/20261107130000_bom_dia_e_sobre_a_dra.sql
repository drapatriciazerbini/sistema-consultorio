begin;

/**
 * Duas mensagens agendadas do robo, portadas do sistema do Dr. Marcello
 * (07/11/2026; la, 20261021090000, 20261021120000 e 20261023120000):
 *
 *  - bom dia as 8h para quem pediu a equipe fora do horario (funcao
 *    bom-dia-da-equipe, regra em _shared/bom-dia-da-equipe.ts);
 *  - "Sobre a Dra." 6 horas depois de quem perguntou convenio ou preco, ou
 *    parou no meio do pedido de consulta, e o menu de novo perto de fechar as
 *    24h da Meta (funcao depois-do-convenio, regra em
 *    _shared/depois-do-convenio.ts).
 *
 * As duas so mandam texto livre dentro da janela de 24h da Meta: nenhum
 * modelo novo para aprovar.
 */

/**
 * Qual resposta pronta vai sozinha para quem sumiu depois do preco. Marcada na
 * tela de Respostas ("Mandar sozinha para quem perguntou convenio ou preco").
 * Falso para todas: nada sai ate a equipe ligar uma.
 */
alter table public.bot_answers
  add column if not exists after_price_silence boolean not null default false;

comment on column public.bot_answers.after_price_silence is
  'Resposta mandada sozinha 6h depois de quem perguntou convenio ou preco, ou parou no pedido de consulta, e nao escreveu mais (funcao depois-do-convenio).';

/**
 * O rascunho do texto, DESLIGADO (is_active e after_price_silence falsos):
 * fica na tela de Respostas para o Edu e a Dra. revisarem e ligarem. Usa so o
 * que ja esta nas respostas e no conhecimento do atendente com IA (Gonzaga,
 * visita domiciliar, recibo para reembolso). Sem palavras-chave: nao responde
 * pergunta nenhuma, so sai pela funcao. Uma vez so por clinica, pelo assunto.
 */
insert into public.bot_answers (clinic_id, subject, keywords, answer, ask_unit, position, is_active, after_price_silence)
select c.id, 'Sobre a Dra. Patrícia', array[]::text[],
  E'Oi! Passando para contar um pouco mais sobre a Dra. Patrícia, para ajudar na sua decisão 😊\n\n' ||
  E'👩‍⚕️ *Dra. Patrícia Zerbini* é médica geriatra, pós-graduada em Geriatria, e cuida da saúde da pessoa idosa.\n\n' ||
  E'🩺 *Como é a consulta:*\n' ||
  E'• *sem pressa*, para entender a história toda\n' ||
  E'• revisão de *todos os remédios* em uso\n' ||
  E'• a família ou o cuidador pode participar\n\n' ||
  E'📍 Atende no *consultório, no Gonzaga (Santos)*, e em *visita domiciliar*, na casa do paciente.\n\n' ||
  E'💳 Mesmo sem convênio, emitimos *recibo com CRM e CNPJ para pedir reembolso* ao seu plano.\n\n' ||
  E'Se quiser seguir com o pedido de consulta, é só me responder aqui 💚',
  false, 900, false, false
from public.clinics c
where c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and not exists (
    select 1 from public.bot_answers b
     where b.clinic_id = c.id and lower(btrim(b.subject)) = lower('Sobre a Dra. Patrícia')
  );

/**
 * Os dois disparos. Mesmo desenho do lembrete e do gasto da Meta: segredo lido
 * do Vault dentro da funcao, os dois nomes aceitos, e a falta dele grita no
 * log - o lembrete ficou tres semanas parado por um erro de maiusculas que
 * ninguem via (20260923130000_consertar_segredo_do_lembrete).
 */
create or replace function private.disparar_bom_dia_da_equipe()
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
    raise warning 'cron_secret ausente no Vault; bom dia da equipe nao sera enviado';
    return;
  end if;

  perform net.http_post(
    url := 'https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/bom-dia-da-equipe'::text,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', segredo
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function private.disparar_bom_dia_da_equipe() from public, anon, authenticated;

comment on function private.disparar_bom_dia_da_equipe() is
  'Chama a Edge Function bom-dia-da-equipe com o segredo do Vault. Avisa no log quando nao acha o segredo.';

create or replace function private.disparar_depois_do_convenio()
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
    raise warning 'cron_secret ausente no Vault; "Sobre a Dra." e menu de novo nao serao enviados';
    return;
  end if;

  perform net.http_post(
    url := 'https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/depois-do-convenio'::text,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', segredo
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function private.disparar_depois_do_convenio() from public, anon, authenticated;

comment on function private.disparar_depois_do_convenio() is
  'Chama a Edge Function depois-do-convenio com o segredo do Vault. Avisa no log quando nao acha o segredo.';

-- 11h UTC = 8h em Sao Paulo (sem horario de verao desde 2019), todo dia: o
-- pedido de sexta a noite recebe o bom dia no sabado, dentro das 24h.
select cron.unschedule('bom-dia-da-equipe')
where exists (select 1 from cron.job where jobname = 'bom-dia-da-equipe');

select cron.schedule(
  'bom-dia-da-equipe',
  '0 11 * * *',
  $$ select private.disparar_bom_dia_da_equipe(); $$
);

-- A cada 10 minutos: a regra (6 horas de silencio, das 8h as 22h, uma vez por
-- conversa) mora na funcao; aqui so o relogio.
select cron.unschedule('depois-do-convenio')
where exists (select 1 from cron.job where jobname = 'depois-do-convenio');

select cron.schedule(
  'depois-do-convenio',
  '*/10 * * * *',
  $$ select private.disparar_depois_do_convenio(); $$
);

commit;
