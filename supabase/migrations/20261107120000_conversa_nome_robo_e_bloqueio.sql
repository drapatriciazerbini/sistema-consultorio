begin;

/**
 * Quatro botoes da conversa que vieram do sistema do Dr. Marcello (07/11/2026),
 * numa migration so: renomear a conversa, responder citando, desligar o robo
 * so nesta conversa e bloquear o contato. La foram tres migrations
 * (20261020180000, 20261023170000 e 20261107120000).
 *
 * Tudo aqui e coluna nova com valor nulo ou falso por padrao: quem ja existe
 * continua exatamente como esta. O codigo le cada coluna em consulta separada
 * (CLAUDE.md), entao a tela e o robo sobrevivem a esta migration atrasada.
 */

/**
 * Nome da conversa escolhido pela equipe.
 *
 * No sistema de origem o numero corporativo de um convenio marcou consulta
 * para um paciente pelo robo, e dali em diante a conversa da atendente do
 * convenio aparecia com o nome do paciente. Aqui o caso comum e o inverso: o
 * numero e da filha que cuida da mae, e a conversa aparece com o nome da mae.
 *
 * O nome daqui so muda o que a tela mostra no cartao e no cabecalho. O
 * cadastro do paciente continua como esta. Nulo = nome do cadastro ou do
 * WhatsApp, como antes.
 */
alter table public.whatsapp_conversations
  add column if not exists nome_personalizado text;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_nome_personalizado_tamanho;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_nome_personalizado_tamanho
  check (nome_personalizado is null or char_length(nome_personalizado) between 1 and 120);

comment on column public.whatsapp_conversations.nome_personalizado is
  'Nome que a equipe deu a esta conversa na tela (botao Renomear). Nao muda o cadastro do paciente. Nulo = nome do cadastro ou do WhatsApp.';

grant update (nome_personalizado) on table public.whatsapp_conversations to authenticated;

/**
 * Mensagem respondida: o "responder" do WhatsApp.
 *
 * A equipe responde citando uma mensagem do paciente, e ele ve a citacao no
 * WhatsApp dele (context.message_id da Meta). Guardar aqui a mensagem citada
 * deixa a tela mostrar a mesma citacao em cima do balao. Tambem vale para o
 * paciente citando uma mensagem nossa. Sem grant: quem grava e o servidor.
 */
alter table public.whatsapp_messages
  add column if not exists responde_a uuid references public.whatsapp_messages(id) on delete set null;

comment on column public.whatsapp_messages.responde_a is
  'Mensagem que esta responde, citada no WhatsApp (context.message_id). Nulo = mensagem solta.';

/**
 * "Este numero nao e do paciente".
 *
 * Desliga a conversa do cadastro quando o telefone casou com o paciente
 * errado (a filha que marca para os dois pais, o numero da casa de repouso).
 * A tela nao recebe permissao direta em patient_id: ligar a conversa a um
 * paciente continua so pelo vincular_contato_ao_paciente, que confere o
 * telefone. Aqui so se desliga.
 *
 * Se o cadastro continuar com este telefone, a proxima mensagem liga de novo:
 * corrigir o telefone do paciente e parte do conserto, e a tela avisa.
 */
create or replace function public.desvincular_conversa_do_paciente(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_clinic_id uuid;
begin
  select c.clinic_id into v_clinic_id
  from public.whatsapp_conversations c
  where c.id = p_conversation_id;

  if v_clinic_id is null then
    raise exception 'Conversa nao encontrada.';
  end if;

  if not (select private.is_clinic_editor(v_clinic_id)) then
    raise exception 'Sem permissao para mudar conversas nesta clinica.';
  end if;

  update public.whatsapp_conversations
  set patient_id = null
  where id = p_conversation_id;
end;
$fn$;

comment on function public.desvincular_conversa_do_paciente(uuid) is
  'Desliga a conversa do cadastro do paciente, quando o telefone casou com o paciente errado.';

revoke all on function public.desvincular_conversa_do_paciente(uuid) from public, anon;
grant execute on function public.desvincular_conversa_do_paciente(uuid) to authenticated;

/**
 * Robo desligado so nesta conversa.
 *
 * No sistema de origem o primeiro botao desligava o robo da clinica inteira,
 * e o Edu pediu: "o desligar robo tem que ser na conversa individual, nao em
 * tudo". A equipe assume um paciente e o robo segue atendendo os outros.
 *
 * Nulo = o robo responde nesta conversa, como antes. Preenchido = quando a
 * equipe desligou; o robo (menu, pedido de consulta, atendente com IA, "Sobre
 * a Dra." depois do preco) fica calado ate alguem religar. Lembrete e
 * acompanhamento agendados continuam saindo: sao avisos da clinica, nao
 * resposta do robo.
 */
alter table public.whatsapp_conversations
  add column if not exists robo_desligado_em timestamptz;

comment on column public.whatsapp_conversations.robo_desligado_em is
  'Quando a equipe desligou o robo so nesta conversa (botao na conversa). Nulo = o robo responde normalmente.';

grant update (robo_desligado_em) on table public.whatsapp_conversations to authenticated;

/**
 * Bloquear um contato. Ver supabase/functions/_shared/bloqueio.ts.
 *
 * No sistema de origem um numero sem cadastro mandava "[unsupported]" (talvez
 * ligacao) quase todo dia, e cada uma acendia a conversa e avisava os
 * celulares da equipe. Nao havia como fazer o numero parar.
 *
 * bloqueado_em: quando a equipe bloqueou. Nulo = contato normal. Preenchido =
 * o webhook ignora o que vier deste numero (sem robo, sem etiqueta, sem aviso).
 *
 * bloqueado_no_whatsapp: a Meta confirmou o bloqueio no WhatsApp da clinica (o
 * numero nao consegue mais escrever nem ligar). Falso com bloqueado_em
 * preenchido = bloqueado so na Central, quase sempre porque a Meta so bloqueia
 * quem escreveu nas ultimas 24 horas; o webhook tenta de novo quando ele
 * escrever.
 *
 * Sem grant de update para authenticated: quem grava e a edge function
 * whatsapp-bloqueio, que fala com a Meta antes. Gravar so no banco mostraria
 * "bloqueado no WhatsApp" sem a Meta saber.
 */
alter table public.whatsapp_conversations
  add column if not exists bloqueado_em timestamptz,
  add column if not exists bloqueado_no_whatsapp boolean not null default false;

comment on column public.whatsapp_conversations.bloqueado_em is
  'Quando a equipe bloqueou este contato (botao na conversa). Nulo = normal. Preenchido = o webhook ignora as mensagens dele.';

comment on column public.whatsapp_conversations.bloqueado_no_whatsapp is
  'A Meta confirmou o bloqueio no WhatsApp da clinica. Falso com bloqueado_em = bloqueado so na Central (regra das 24 horas da Meta).';

commit;
