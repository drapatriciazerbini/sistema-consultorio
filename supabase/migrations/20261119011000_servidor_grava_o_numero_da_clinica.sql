begin;

-- O servidor grava o numero do WhatsApp na clinica (porte de 19/11/2026 do
-- sistema do Dr. Fabio, onde e a 20261116090000).
--
-- A funcao whatsapp-conectar termina a ligacao de um numero gravando
-- whatsapp_waba_id e whatsapp_phone_number_id em clinic_settings, pelo
-- servidor (service_role). Neste banco o servidor so tem "grant select" na
-- tabela (20260823193000) e update coluna a coluna (20261103100000,
-- 20261118050000): sem este grant o update seria recusado com "permission
-- denied".
--
-- Na origem isso apareceu na primeira ligacao de um numero no ambiente
-- definitivo, em 16/11/2026: a funcao respondia so "Falha inesperada", com os
-- avisos da conta ja assinados na Meta e o numero sem gravar. Aqui vem junto
-- com a funcao, antes do dia da troca.
--
-- So as duas colunas (as duas existem desde 20260822120000): o resto da
-- configuracao da clinica continua sendo gravado so pelo responsavel, pela
-- tela. Este grant sozinho nao muda nada: quem grava e a whatsapp-conectar, e
-- so quando o responsavel a chama.

grant update (whatsapp_waba_id, whatsapp_phone_number_id) on table public.clinic_settings to service_role;

commit;
