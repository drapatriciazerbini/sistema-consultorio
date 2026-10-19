begin;

/**
 * Quem veio do Google antes da frase do site (19/10/2026).
 *
 * A frase "Encontrei a Dra. Patricia Zerbini no Google" so existe no botao do
 * site desde 19/10/2026 as 15:24. As conversoes que o Google Ads registrou
 * antes disso (toque no WhatsApp do site depois de clicar no anuncio) chegaram
 * com a frase comum do site. O Edu pediu para elas aparecerem na aba Google.
 *
 * O Ads nao diz quem e quem, so a hora. Os horarios abaixo foram lidos no
 * Google Ads em 19/10/2026 (conversoes por hora do dia, horario de Brasilia).
 * Entra a conversa que recebeu a frase comum do site dentro da hora da
 * conversao (paciente antigo que clicou no anuncio tambem conta) (com 15 minutos de folga, para quem demorou a
 * enviar). Fica marcada como "Pelo horario do Google Ads", para separar da
 * marca certa; se alguma estiver errada, o botao "Tirar do Google" desfaz.
 */
with janelas(inicio) as (
  values
    (timestamptz '2026-10-08 08:00:00-03'),
    (timestamptz '2026-10-14 17:00:00-03'),
    (timestamptz '2026-10-19 05:00:00-03'),
    (timestamptz '2026-10-19 10:00:00-03')
),
achadas as (
  select m.conversation_id, min(m.created_at) as created_at
  from public.whatsapp_messages m
  join janelas j
    on m.created_at >= j.inicio
   and m.created_at < j.inicio + interval '75 minutes'
  where m.direction = 'inbound'
    and m.body ilike '%gostaria de informa%es sobre uma consulta com a dra%patr%cia zerbini%'
  group by m.conversation_id
)
update public.whatsapp_conversations c
set origem_anuncio = 'google',
    origem_anuncio_em = a.created_at,
    origem_anuncio_titulo = 'Pelo horário do Google Ads'
from achadas a
where a.conversation_id = c.id
  and c.origem_anuncio is null;

commit;
