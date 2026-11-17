-- Ferias da Dra. Patricia: o dia em que o atendimento volta (17/11/2026).
--
-- Pedido do Edu: "se alguem quiser alguma data antes, e para falar que ela ta
-- de ferias. E o atendimento sera reiniciado a partir do dia 14 de dezembro. E
-- ai vem os horarios que eu te passei." Os horarios sao schedule_exceptions com
-- is_closed falso (horario extra em data unica, ver src/lib/agenda-extra.ts);
-- esta coluna guarda so a data da volta.
--
-- Enquanto a data nao chega, o robo e o atendente com IA dizem que ela esta de
-- ferias e nao oferecem nada antes (feriasDaClinica, em atendimento.ts). Passou
-- a data, o aviso some sozinho: ninguem precisa lembrar de apagar.
--
-- Coluna nova: o codigo le em consulta separada, com try/catch. Sem esta
-- migration o robo segue como antes, sem o aviso, e a Agenda diz que a
-- atualizacao do banco nao chegou.

begin;

alter table public.clinic_settings
  add column if not exists ferias_volta_em date;

comment on column public.clinic_settings.ferias_volta_em is
  'Ferias: primeiro dia de atendimento na volta. Enquanto for futuro, o WhatsApp avisa das ferias e nao oferece horario antes dele. Nulo = sem ferias.';

-- Update em clinic_settings e liberado coluna a coluna (ver 20260825120000).
-- A policy de update continua decidindo quem: nada de RLS mexido aqui.
grant update (ferias_volta_em) on table public.clinic_settings to authenticated;

commit;
