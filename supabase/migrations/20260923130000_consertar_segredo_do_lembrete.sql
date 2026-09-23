begin;

/**
 * Mesmo conserto que o sistema do Dr. Marcello recebeu em 20/09/2026
 * (20260920180000), trazido para cá antes de o lembrete ser ligado.
 *
 * O PROBLEMA, herdado da cópia: a migration 20260831050000 recriou o job do
 * pg_cron buscando o segredo no Vault pelo nome 'CRON_SECRET', em maiúsculas,
 * enquanto o disparo diário e a versão anterior do lembrete leem
 * 'cron_secret', em minúsculas. O nome no Vault diferencia maiúsculas de
 * minúsculas: com o segredo gravado de um jeito, uma das duas tarefas fica
 * sem ele. O job chamava a Edge Function com o cabeçalho vazio, levava 401 e
 * o pg_cron marcava sucesso mesmo assim, porque a requisição tinha saído. No
 * Dr. Marcello isso passou três semanas sem aparecer.
 *
 * Aqui ainda não fez estrago: o Vault da Patrícia estava vazio até hoje, então
 * nenhum lembrete tinha sido tentado.
 *
 * O CONSERTO: a função aceita os dois nomes, e grita no log quando não acha
 * nenhum, em vez de fazer uma chamada que será recusada em silêncio.
 */

create or replace function private.disparar_lembretes_de_consulta()
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
    raise warning 'cron_secret ausente no Vault; lembretes de consulta nao serao enviados';
    return;
  end if;

  perform net.http_post(
    url := 'https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/appointment-reminders'::text,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', segredo
    )
  );
end;
$$;

revoke all on function private.disparar_lembretes_de_consulta() from public, anon, authenticated;

comment on function private.disparar_lembretes_de_consulta() is
  'Chama a Edge Function dos lembretes com o segredo do Vault. Aceita cron_secret e CRON_SECRET, e avisa no log quando nao acha nenhum.';

-- O job passa a chamar a função, em vez de carregar o SQL no corpo dele.
--
-- Não é organização: a definição de um job do pg_cron é legível por qualquer
-- um com acesso ao banco, e com a consulta ao Vault ali dentro o nome do
-- segredo ficava exposto - foi assim que o erro de maiúsculas passou
-- despercebido, escrito num lugar que ninguém relê. Dentro de uma função
-- security definer, ele fica num lugar só, com nome e comentário.
select cron.unschedule('lembretes-consulta')
where exists (select 1 from cron.job where jobname = 'lembretes-consulta');

select cron.schedule(
  'lembretes-consulta',
  '20 * * * *',
  $$ select private.disparar_lembretes_de_consulta(); $$
);

commit;
