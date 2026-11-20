begin;

/**
 * Coexistencia do numero do consultorio (porte de 19/11/2026 do sistema do
 * Dr. Fabio, onde e a 20261027100000_coexistencia.sql; aqui esse numero ja era
 * de outra migration, por isso o nome e a data novos).
 *
 * O plano do Edu para o numero do robo da Dra. Patricia: sair da conta de
 * hoje na API, ser registrado no app WhatsApp Business do celular do
 * consultorio e voltar a API por coexistencia, pelo app da ECM. Dai em diante
 * a equipe responde tambem pelo celular, e a Meta manda para o meta-webhook o
 * que foi escrito la. Ver supabase/functions/_shared/coexistencia.ts.
 *
 * ESTA MIGRATION NAO MUDA NADA DO QUE EXISTE: uma coluna nula a mais e uma
 * tabela vazia. Ate o dia da troca a Meta nao manda os avisos que as enchem.
 *
 * De onde veio a mensagem que nao nasceu na Central nem no robo:
 *  - 'historico': conversa do app de antes da ligacao, trazida pela Meta (os
 *    ultimos 6 meses, uma vez);
 *  - 'celular': escrita pela equipe no app do celular depois da ligacao (o
 *    aviso smb_message_echoes da Meta).
 * Nulo = como sempre: recebida ao vivo, robo ou Central.
 *
 * O codigo le e grava esta coluna a parte: sem ela, a mensagem entra do mesmo
 * jeito e some so a etiqueta "pelo celular" da tela.
 *
 * Permissoes: whatsapp_messages ja tem select de tabela inteira para
 * authenticated (20260822120000) e select, insert e update de tabela inteira
 * para service_role (20260823193000). Coluna nova entra nos dois sem grant.
 */
alter table public.whatsapp_messages
  add column if not exists origem text;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_origem_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_origem_check
  check (origem is null or origem in ('historico', 'celular'));

comment on column public.whatsapp_messages.origem is
  'historico = conversa do app WhatsApp Business de antes da ligacao a API; celular = escrita pela equipe no app depois dela. Nulo = recebida ao vivo, robo ou Central.';

/**
 * Os contatos da agenda do app do celular (aviso smb_app_state_sync).
 *
 * A Meta manda todos de uma vez logo depois da ligacao, antes do historico, e
 * depois cada contato salvo, mudado ou apagado. O nome que a equipe deu ao
 * contato ("Dona Maria, filha Claudia") vira o nome da conversa sem cadastro
 * (whatsapp_conversations.nome_personalizado, de 20261107120000); guardar
 * aqui e o que permite isso para conversas que o historico so cria depois.
 * Removido fica com a data, e nao some: a conversa que ja levou o nome nao
 * perde.
 *
 * wa_id sao so os digitos do telefone, como em whatsapp_conversations.wa_id.
 */
create table if not exists public.whatsapp_contatos_do_celular (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  wa_id text not null,
  nome text check (nome is null or char_length(nome) between 1 and 120),
  removido_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (clinic_id, wa_id)
);

comment on table public.whatsapp_contatos_do_celular is
  'Contatos da agenda do app WhatsApp Business do celular do consultorio (coexistencia). Gravado so pelo meta-webhook.';

alter table public.whatsapp_contatos_do_celular enable row level security;
alter table public.whatsapp_contatos_do_celular force row level security;

-- So leitura, e so de quem e membro da clinica da linha: a mesma pergunta das
-- tabelas vizinhas (whatsapp_conversations, patient_phones). Nao ha policy de
-- insert, update ou delete: com a RLS forcada, a tela nao grava aqui nem que
-- alguem de o grant por engano.
drop policy if exists whatsapp_contatos_do_celular_leitura on public.whatsapp_contatos_do_celular;
create policy whatsapp_contatos_do_celular_leitura on public.whatsapp_contatos_do_celular
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

revoke all on table public.whatsapp_contatos_do_celular from public, anon, authenticated;
grant select (clinic_id, wa_id, nome, removido_em, atualizado_em)
  on table public.whatsapp_contatos_do_celular to authenticated;
-- O meta-webhook (service_role) le, cria e atualiza; nunca apaga (contato
-- removido da agenda so ganha a data). Sem este grant os contatos se
-- perderiam, com um erro no log da funcao a cada aviso.
grant select, insert, update on table public.whatsapp_contatos_do_celular to service_role;

commit;
