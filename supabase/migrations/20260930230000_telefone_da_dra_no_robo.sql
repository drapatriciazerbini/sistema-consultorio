begin;

/**
 * Um telefone só para falar com uma pessoa: o da Dra. Patrícia (30/09/2026).
 *
 * A Dra. Patrícia prefere responder ela mesma ("sou rápida no atendimento") e
 * contou que a secretária é mais lenta. O número da secretária sai do fecho
 * da opção 1 e entra o dela, sem dizer de quem é: "prefere falar com uma
 * pessoa?". Assim ninguém escreve esperando consulta pelo WhatsApp com a
 * médica, e ela decide como responder.
 *
 * Só onde o número novo ainda não aparece. Se a frase da secretária foi
 * editada pela tela, o número novo vai para o fim do fecho.
 */

update public.clinic_settings cs
set whatsapp_menu_info_text = case
      when strpos(cs.whatsapp_menu_info_text,
             E'📞 Se preferir, fale direto com a secretária: *(13) 98112-9572*, por ligação ou WhatsApp.') > 0 then
        replace(
          cs.whatsapp_menu_info_text,
          E'📞 Se preferir, fale direto com a secretária: *(13) 98112-9572*, por ligação ou WhatsApp.',
          E'📞 Prefere falar com uma pessoa? *(13) 99706-9292*, por ligação ou WhatsApp.'
        )
      else
        rtrim(cs.whatsapp_menu_info_text) ||
        E'\n\n📞 Prefere falar com uma pessoa? *(13) 99706-9292*, por ligação ou WhatsApp.'
    end
from public.clinics c
where c.id = cs.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and strpos(cs.whatsapp_menu_info_text, '99706') = 0;

commit;
