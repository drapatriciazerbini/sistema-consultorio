begin;

/**
 * Devolver a conversa ao robo, mesmo depois de alguem da equipe responder.
 *
 * O caso, em 23/09/2026: o Edu respondeu um "Oi" pela tela as 00:27 e, as
 * 07:54, com o menu automatico ja ligado, mandou outro "Oi". O robo se calou,
 * corretamente: quando alguem da equipe escreve, ele fica 12 horas sem
 * interromper a conversa humana. Mas a conversa ficou marcada "Quer falar com
 * a equipe" e SEM o botao Destravar - o botao so aparecia quando havia uma
 * etapa de agendamento presa, e aqui nao havia etapa nenhuma. Nao existia
 * jeito de devolver a conversa ao robo antes das 12 horas.
 *
 * Esta coluna guarda o momento em que alguem da equipe devolveu a conversa. O
 * webhook passa a considerar "a equipe falou ha pouco" so para mensagens da
 * equipe DEPOIS desse momento.
 */

alter table public.whatsapp_conversations
  add column if not exists bot_released_at timestamptz;

comment on column public.whatsapp_conversations.bot_released_at is
  'Quando a equipe devolveu a conversa ao robo pela tela. Mensagem manual anterior a isto nao silencia o robo.';

grant update (bot_released_at) on table public.whatsapp_conversations to authenticated;

commit;
