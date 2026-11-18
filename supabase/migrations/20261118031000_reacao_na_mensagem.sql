begin;

/**
 * Reacao da equipe a uma mensagem do paciente (porte de 18/11/2026).
 *
 * No sistema do Dr. Marcello, em 13/11/2026, o Edu pediu: dar um joinha no
 * "Sim, entendi" de quem escreveu em vez de mandar outra mensagem. Aqui o
 * caso e o mesmo: a filha ou o cuidador responde "combinado" ao recado da
 * Dra. Patricia, e a equipe so quer acusar que leu. A Meta aceita reacao pela
 * API (type "reaction"). A reacao nao e uma mensagem nova: fica pendurada na
 * mensagem a que responde, e e aqui que a tela le para mostrar o emoji
 * embaixo do balao.
 *
 * Quem grava e a edge function whatsapp-reply (service_role, que ja tem
 * update em whatsapp_messages desde 20260823193000), depois que a Meta
 * aceita. A tela so le: authenticated tem select na tabela inteira
 * (20260822120000) e nenhum update, entao nao ha grant novo aqui, e a RLS
 * da tabela continua decidindo quem ve. Nulo ou vazio = sem reacao.
 *
 * Coluna nova: o codigo le em consulta separada, com try/catch. Sem esta
 * migration a conversa abre igual, so sem o emoji.
 */
alter table public.whatsapp_messages
  add column if not exists reacao text;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_reacao_tamanho;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_reacao_tamanho
  check (reacao is null or char_length(reacao) <= 16);

comment on column public.whatsapp_messages.reacao is
  'Emoji com que a equipe reagiu a esta mensagem do paciente (whatsapp-reply). Nulo = sem reacao.';

commit;
