-- Aviso do pedido de consulta no WhatsApp pessoal da Dra. Patricia (28/10/2026).
--
-- Pedido do Edu em 27/10/2026: quando alguem pede consulta ou visita em casa
-- pelo robo, a Dra. e avisada no celular dela, a qualquer hora, e responde o
-- paciente por la mesmo, sem abrir a Central. Ate aqui o pedido so acendia a
-- conversa na tela e mandava a notificacao do navegador. Caso de 19/10/2026:
-- um paciente pediu consulta pelo robo, a equipe confirmou o horario a mao e
-- ninguem falou de valor nem de particular. O pedido estava na tela, mas nao
-- com quem decide.
--
-- Porte do alerta de urgencia do sistema do Dr. Marcello (migrations
-- 20261017180000, 20261017200000 e 20261018180000 de la), com os MESMOS nomes
-- de coluna e de tabela, para os proximos portes cairem no lugar certo. Aqui o
-- motivo e 'pedido'; a urgencia fica pronta para quando vier.
--
-- Codigo novo le estas colunas em consulta separada, com try/catch: sem esta
-- migration o aviso so nao sai (com erro no log) e o atendimento segue inteiro.

begin;

-- 1. Os celulares que recebem o aviso ---------------------------------------
--
-- No banco, editaveis em Preferencias, e nao no codigo (o repositorio circula)
-- nem em segredo do servidor: no sistema de origem o lembrete da vespera ficou
-- tres semanas parado por um segredo escrito errado, e trocar o numero de quem
-- recebe nao pode depender de alguem mexer no painel. O primeiro numero e o
-- da Dra. Patricia; os outros respondem como equipe.
alter table public.clinic_settings
  add column if not exists alerta_urgencia_telefones text[] not null default '{}'::text[];

comment on column public.clinic_settings.alerta_urgencia_telefones is
  'Celulares (55 + DDD + numero) que recebem no WhatsApp o aviso de pedido de consulta ou visita, a qualquer hora. O primeiro e o da Dra. Patricia. Editavel em Preferencias > Aviso no WhatsApp da Dra.';

-- Update em clinic_settings e liberado coluna a coluna (ver 20260825120000).
-- A policy clinic_settings_update_owner continua decidindo quem: so o dono.
grant update (alerta_urgencia_telefones) on table public.clinic_settings to authenticated;

-- 2. Cada aviso enviado ---------------------------------------------------------
--
-- mensagens: os ids das mensagens de aviso na Meta. Quando a Dra. responde "em
-- cima" do aviso, o WhatsApp manda esse id junto, e e assim que se sabe de
-- qual paciente e a resposta sem perguntar.
-- rascunho: o texto que ela escreveu, esperando o "Enviar". Mensagem em nome
-- dela nao sai sem confirmacao: um "liga pra ela" que era para a equipe nao
-- pode chegar ao paciente.
-- responde_em / valores_em: os dois botoes do aviso agem uma vez so. Gravados
-- com update condicional (where ... is null), para dois toques seguidos nao
-- mandarem o valor duas vezes ao paciente.
-- respondido_em / respondido_por: a ultima resposta deste numero, para o texto
-- sem citar seguir para o mesmo paciente (no sistema de origem, em 18/10/2026,
-- cada mensagem do Edu voltava "Ha 2 avisos recentes").
-- resultado: o que aconteceu no envio ("enviado 1/1", "falhou ..."), que a
-- tela de Preferencias mostra sem ninguem ir ao log.
create table if not exists public.alertas_de_urgencia (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  motivo text not null default 'urgencia' check (motivo in ('urgencia', 'pedido')),
  canal text not null check (canal in ('WhatsApp', 'Instagram')),
  conversa_whatsapp uuid references public.whatsapp_conversations(id) on delete cascade,
  conversa_instagram uuid references public.instagram_conversations(id) on delete cascade,
  -- O botao "Mandar aviso de teste" da tela: sem paciente do outro lado.
  teste boolean not null default false,
  quem text not null default '',
  mensagens text[] not null default '{}'::text[],
  resultado text not null default '',
  veredito text check (veredito is null or veredito in ('urgente', 'aguardar', 'responde', 'valores', 'texto')),
  veredito_por text,
  veredito_em timestamptz,
  responde_em timestamptz,
  valores_em timestamptz,
  rascunho text,
  rascunho_de text,
  rascunho_em timestamptz,
  respondido_em timestamptz,
  respondido_por text,
  criado_em timestamptz not null default now()
);

create index if not exists alertas_de_urgencia_recentes_idx
  on public.alertas_de_urgencia (clinic_id, criado_em desc);
create index if not exists alertas_de_urgencia_respondido_idx
  on public.alertas_de_urgencia (clinic_id, respondido_por, respondido_em desc);

alter table public.alertas_de_urgencia enable row level security;
alter table public.alertas_de_urgencia force row level security;

-- Membro da clinica le (a tela mostra o ultimo aviso); so o servidor escreve.
drop policy if exists alertas_de_urgencia_select_member on public.alertas_de_urgencia;
create policy alertas_de_urgencia_select_member on public.alertas_de_urgencia
for select to authenticated
using ((select private.is_clinic_member(clinic_id)));

revoke all on table public.alertas_de_urgencia from public, anon, authenticated;
grant select on table public.alertas_de_urgencia to authenticated;
grant select, insert, update on table public.alertas_de_urgencia to service_role;

-- 3. A nota interna gravada pelo servidor ---------------------------------------
--
-- Todo aviso e toda resposta da Dra. viram nota na conversa do paciente. A
-- tabela das notas so foi liberada para authenticated (20260930110000), e o
-- service_role deste projeto nao herda privilegio (ver 20260823193000). No
-- sistema de origem, em 23/10/2026 as 09:59, o log dizia "permission denied
-- for table conversation_notes": o alerta saiu, a nota nunca apareceu.
grant select, insert on table public.conversation_notes to service_role;

commit;
