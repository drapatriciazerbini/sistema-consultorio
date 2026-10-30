-- Aviso da duvida no WhatsApp da Dra. Patricia e do Edu (30/10/2026).
--
-- Pedido do Edu: o numero do robo avisa os dois celulares nao so no pedido de
-- consulta, mas tambem na duvida que o robo e a IA nao resolvem. Ver
-- MOTIVOS_DA_DUVIDA em _shared/alerta-de-urgencia.ts.
--
-- A 20261028100000 so aceitava 'urgencia' e 'pedido'. Sem esta aqui o INSERT do
-- aviso falha: o aviso sai igual, mas sem registro, e a resposta dela em cima do
-- aviso nao acha de qual paciente e.

begin;

alter table public.alertas_de_urgencia
  drop constraint if exists alertas_de_urgencia_motivo_check;
alter table public.alertas_de_urgencia
  add constraint alertas_de_urgencia_motivo_check
  check (motivo in ('urgencia', 'pedido', 'duvida'));

comment on column public.clinic_settings.alerta_urgencia_telefones is
  'Celulares (55 + DDD + numero) que recebem no WhatsApp o aviso de pedido de consulta ou visita e o de duvida ou urgencia que o atendimento automatico nao resolve, a qualquer hora. O primeiro e o da Dra. Patricia. Editavel em Preferencias > Aviso no WhatsApp da Dra.';

commit;
