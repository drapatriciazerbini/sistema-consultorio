begin;

/**
 * Marcar na mao que a conversa veio do Google (19/10/2026).
 *
 * A frase do Google no botao do site so existe desde 19/10/2026. Quem chegou
 * pelo anuncio antes disso nao tem como ser reconhecido sozinho; o Edu acha a
 * conversa pelo horario da conversao no Google Ads e marca pela tela
 * (botao "Veio do Google" em Respostas). O titulo fica "Marcada pela equipe",
 * para separar da marca automatica.
 */
grant update (origem_anuncio, origem_anuncio_em, origem_anuncio_titulo, origem_anuncio_url)
  on table public.whatsapp_conversations to authenticated;

commit;
