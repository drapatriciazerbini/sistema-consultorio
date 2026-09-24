begin;

/**
 * O telefone da secretária volta a aparecer, só nas informações (24/09/2026).
 *
 * O site passou a mostrar um número só, o do robô, que não recebe ligação.
 * Quem prefere falar com gente, e de preferência por telefone, precisa de um
 * caminho que não dependa de digitar *9* e esperar. Pedido do Edu: o número da
 * secretária entra como opção no fecho da opção 1 (dúvidas sobre a consulta),
 * que é onde a pessoa está lendo valores e endereço e costuma querer tirar
 * uma dúvida de viva voz.
 *
 * No sistema de origem o caminho foi o contrário (20260916140000, fecho sem
 * telefones), porque lá o telefone da recepção tirava o atendimento do
 * sistema. Aqui é escolha da clínica, e o *9* continua valendo.
 *
 * Só onde a frase do *9* ainda está como foi escrita e o número ainda não
 * aparece: se alguém já editou o fecho pela tela, a edição vale mais.
 */

update public.clinic_settings cs
set whatsapp_menu_info_text = replace(
      cs.whatsapp_menu_info_text,
      E'🙋 Quer falar com alguém da equipe? Digite *9*.',
      E'🙋 Quer falar com alguém da equipe? Digite *9*.\n\n' ||
      E'📞 Se preferir, fale direto com a secretária: *(13) 98112-9572*, por ligação ou WhatsApp.'
    )
from public.clinics c
where c.id = cs.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and strpos(cs.whatsapp_menu_info_text, '98112') = 0;

commit;
