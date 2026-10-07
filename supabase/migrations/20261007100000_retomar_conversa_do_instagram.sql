begin;

/**
 * Retomar a conversa do Direct (07/10/2026).
 *
 * A maioria de quem vem do anúncio toca em "Qual é o valor da consulta?",
 * recebe os valores e some. A Meta deixa a conta responder até 24 horas depois
 * da última mensagem da pessoa; dentro disso o robô manda UMA mensagem de
 * retomada ("Ficou alguma dúvida?") com os botões, umas 3 horas depois da
 * resposta, em horário comercial. Regra em _shared/instagram.ts (deveRetomar),
 * disparo na passada de hora em hora do appointment-reminders.
 */

alter table public.instagram_conversations
  -- O que o robô mandou por último: resposta, menu, agendar, equipe...
  add column if not exists last_bot_kind text,
  -- Quando a retomada foi enviada. Uma por mensagem da pessoa, nunca mais.
  add column if not exists followup_sent_at timestamptz;

alter table public.instagram_bot_events
  drop constraint if exists instagram_bot_events_evento_valido;

alter table public.instagram_bot_events
  add constraint instagram_bot_events_evento_valido check (evento in (
    'mensagem', 'anuncio', 'botao', 'menu', 'resposta', 'agendar', 'equipe',
    'agradecimento', 'equipe_respondeu',
    'retomada'           -- robô mandou o "Ficou alguma dúvida?" horas depois
  ));

commit;
