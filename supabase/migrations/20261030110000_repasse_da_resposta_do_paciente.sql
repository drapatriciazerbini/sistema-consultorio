-- Resposta do paciente de volta ao celular (30/10/2026).
--
-- Pedido do Edu: a Dra. responde pelo celular, o paciente responde a ela, e isso
-- so aparecia na Central, que ela nao fica olhando. Quem combinava a data achava
-- que o paciente nao tinha respondido. Ver repassarAoCelular em
-- _shared/resposta-ao-alerta.ts.
--
-- repasse_aberto_em: a ultima vez que alguem falou com o paciente em cima do
--   aviso ("Eu respondo" ou mensagem escrita). "Mandar os valores" nao abre: e
--   resposta pronta, e o robo segue atendendo.
-- repasse_por: quem falou. E ele que recebe em texto, com a janela de 24 h aberta.
-- repasse_em: o ultimo repasse. A resposta dela sem citar vale por 6 h a contar
--   daqui, como vale a contar do aviso.
-- repasse_modelo_em: o ultimo envio por modelo, que e cobrado. Paciente que manda
--   cinco mensagens seguidas nao gera cinco modelos.

begin;

alter table public.alertas_de_urgencia
  add column if not exists repasse_aberto_em timestamptz,
  add column if not exists repasse_por text,
  add column if not exists repasse_em timestamptz,
  add column if not exists repasse_modelo_em timestamptz;

create index if not exists alertas_de_urgencia_repasse_idx
  on public.alertas_de_urgencia (clinic_id, repasse_aberto_em desc)
  where repasse_aberto_em is not null;

commit;
