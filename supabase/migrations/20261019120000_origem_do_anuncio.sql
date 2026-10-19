begin;

/**
 * De onde a conversa veio: Google, Instagram ou Facebook (19/10/2026).
 *
 * Portado do sistema do Dr. Marcello. Pedido do Edu: saber quem chegou pelo
 * Google (a campanha do Google Ads leva ao site, e o site leva ao WhatsApp do
 * robo). O webhook passa a gravar aqui o que a Meta manda no bloco `referral`
 * (anuncio que leva direto ao WhatsApp) ou, sem ele, a frase pronta que o site
 * poe no botao de WhatsApp de quem veio do Google. Ver
 * _shared/origem-do-anuncio.ts.
 *
 *   origem_anuncio         instagram | facebook | meta (a Meta nao disse qual) | google
 *   origem_anuncio_em      quando a mensagem com a origem chegou (a ultima, se vier de novo)
 *   origem_anuncio_titulo  titulo do anuncio, quando a Meta manda
 *   origem_anuncio_url     o link cru, para conferir a classificacao depois
 *
 * Sem preenchimento retroativo: antes desta data o site nao mandava a frase do
 * Google, entao nao ha o que reconhecer nas mensagens antigas.
 */
alter table public.whatsapp_conversations
  add column if not exists origem_anuncio text,
  add column if not exists origem_anuncio_em timestamptz,
  add column if not exists origem_anuncio_titulo text,
  add column if not exists origem_anuncio_url text;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_origem_anuncio_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_origem_anuncio_check
  check (origem_anuncio is null or origem_anuncio in ('instagram', 'facebook', 'meta', 'google'));

create index if not exists whatsapp_conversations_origem_anuncio
  on public.whatsapp_conversations (clinic_id, origem_anuncio_em desc)
  where origem_anuncio is not null;

commit;
