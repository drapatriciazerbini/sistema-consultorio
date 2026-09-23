-- Liga a clinica da Dra. Patricia ao numero de WhatsApp dela na Cloud API.
--
-- O meta-webhook descobre de qual clinica e cada mensagem recebida pelo
-- phone_number_id que a Meta manda junto. Sem este vinculo, a mensagem do
-- paciente chega, a assinatura confere, e mesmo assim ela e descartada por
-- nao pertencer a nenhuma clinica.
--
-- Estes dois numeros nao sao segredo: identificam a conta e o telefone na Meta,
-- mas nao dao acesso a nada sem o token, que fica so nos secrets do Supabase.
--   WABA "Dra Patricia Zerbini": 1613978470235825
--   Numero +55 13 99668-0402:   1246833511856817
--
-- O filtro pelo nome da clinica, e nao por um id fixo, e de proposito: a
-- migration 20260822120000 veio do sistema do Dr. Marcello com o id da clinica
-- dele, e por isso nao alterou nada aqui. Este arquivo so encontra a clinica
-- da Patricia.
update public.clinic_settings cs
set whatsapp_waba_id = '1613978470235825',
    whatsapp_phone_number_id = '1246833511856817',
    whatsapp_template_name = 'acompanhamento_pos_consulta',
    whatsapp_template_language = 'pt_BR'
from public.clinics c
where c.id = cs.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini';
