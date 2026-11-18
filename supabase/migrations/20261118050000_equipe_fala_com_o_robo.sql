begin;

/**
 * "Falar com o robo" pelo celular da equipe (porte de 18/11/2026).
 *
 * No sistema do Dr. Marcello, em 13/11/2026: o Edu testa o robo pelo proprio
 * celular, que e um dos numeros que recebem os avisos. Com aviso recente na
 * fila, o "oi" dele virava pergunta de para quem mandar a mensagem: "eu nao
 * quero responder ninguem, eu quero mandar mensagem so pro robo". Aqui e
 * igual: com um pedido de consulta nas ultimas 6 horas, o "oi" do Edu ou da
 * Dra. Patricia vira "Vou mandar para Fulano... Confirma?". A pergunta ganhou
 * a opcao "Falar com o robo"; quem toca fala com o robo por 2 horas, como se
 * fosse um paciente.
 *
 * Aqui fica quem esta nesse modo e ate quando: { "5513...": { desde, ate } }.
 * Quem le e grava e o meta-webhook (service_role), em consulta separada do
 * resto do clinic_settings. Sem a coluna, ninguem esta no modo, o toque no
 * botao responde que nao conseguiu ligar, e tudo segue como antes. Ver
 * _shared/resposta-ao-alerta.ts (modoRoboVale).
 */
alter table public.clinic_settings
  add column if not exists equipe_no_robo jsonb not null default '{}'::jsonb;

comment on column public.clinic_settings.equipe_no_robo is
  'Celulares da equipe falando com o robo como se fossem paciente: { numero: { desde, ate } }. Gravado pelo meta-webhook.';

-- O webhook grava pelo service_role, que neste banco so tem select no
-- clinic_settings (20260823193000) e update coluna a coluna (como em
-- 20261103100000). Sem este grant o botao responderia sempre "nao consegui
-- ligar". A tela nao grava nesta coluna: nenhum grant para authenticated, e a
-- RLS da tabela continua como esta.
grant update (equipe_no_robo) on table public.clinic_settings to service_role;

commit;
