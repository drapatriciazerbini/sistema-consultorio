-- Endereco do consultorio ganha o numero da sala: Conjunto 35.
-- A Dra. Patricia informou em 28/09/2026. O predio (Rua Dr. Tolentino
-- Filgueiras, 119) tem varios consultorios, e sem o conjunto o paciente
-- chega na portaria sem saber para onde ir.
--
-- Troca so o trecho "Tolentino Filgueiras, 119" por
-- "Tolentino Filgueiras, 119, Conjunto 35", e so onde o conjunto ainda nao
-- aparece. Rodar de novo nao duplica nada.
--
-- O endereco do perfil do WhatsApp muda aqui no banco, mas so chega na Meta
-- quando alguem salvar o perfil pela tela do sistema.

begin;

-- Endereco e texto do atendimento no consultorio
update public.clinic_units u
set address = replace(u.address, 'Tolentino Filgueiras, 119', 'Tolentino Filgueiras, 119, Conjunto 35')
from public.clinics c
where c.id = u.clinic_id
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and u.address like '%Tolentino Filgueiras, 119%'
  and u.address not like '%Conjunto 35%';

update public.clinic_units u
set info_text = replace(u.info_text, 'Tolentino Filgueiras, 119', 'Tolentino Filgueiras, 119, Conjunto 35')
from public.clinics c
where c.id = u.clinic_id
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and u.info_text like '%Tolentino Filgueiras, 119%'
  and u.info_text not like '%Conjunto 35%';

-- Respostas prontas do robo (ex.: "Endereço do consultório")
update public.bot_answers b
set answer = replace(b.answer, 'Tolentino Filgueiras, 119', 'Tolentino Filgueiras, 119, Conjunto 35')
from public.clinics c
where c.id = b.clinic_id
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and b.answer like '%Tolentino Filgueiras, 119%'
  and b.answer not like '%Conjunto 35%';

-- Endereco do perfil do WhatsApp (fica no banco ate salvar pela tela)
update public.clinic_settings
set whatsapp_profile_address = replace(whatsapp_profile_address, 'Tolentino Filgueiras, 119', 'Tolentino Filgueiras, 119, Conjunto 35')
where whatsapp_profile_address like '%Tolentino Filgueiras, 119%'
  and whatsapp_profile_address not like '%Conjunto 35%';

commit;
