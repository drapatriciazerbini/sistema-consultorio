-- Atendente com IA (Claude) no WhatsApp da Dra. Patricia (28/10/2026).
--
-- Pedido do Edu: "Liga a IA do Claude no chatbot da Patricia, como no sistema
-- do Marcello". Porte das migrations 20261015180000_atendente_com_ia e
-- 20261016090000_conhecimento_do_atendente_ia de la, juntas aqui, com os
-- MESMOS nomes de coluna para os proximos portes cairem no lugar certo. Ver
-- supabase/functions/_shared/assistente.ts.
--
-- Um modo por clinica, desligado por padrao: nenhuma conversa muda ate alguem
-- escolher "sombra" ou "ligado" em Preferencias. As mensagens que o Claude
-- escreveu ficam marcadas, para a equipe saber quem falou. E um texto livre com
-- o que a IA sabe do consultorio alem dos cartoes e das respostas prontas.
--
-- Colunas novas: o codigo le cada uma em consulta separada, com try/catch.
-- Sem esta migration, a IA fica desligada, o cartao de Preferencias avisa que
-- a atualizacao do banco nao chegou e o resto segue igual.

begin;

-- 1. O modo ------------------------------------------------------------------
alter table public.clinic_settings
  add column if not exists assistente_ia text not null default 'desligado';

alter table public.clinic_settings
  drop constraint if exists clinic_settings_assistente_ia_check;
alter table public.clinic_settings
  add constraint clinic_settings_assistente_ia_check
  check (assistente_ia in ('desligado', 'sombra', 'ligado'));

comment on column public.clinic_settings.assistente_ia is
  'Atendente com IA no WhatsApp: desligado (robo de regras), sombra (o robo responde e a IA so escreve nota interna) ou ligado (a IA responde).';

-- Update em clinic_settings e liberado coluna a coluna (ver 20260825120000).
-- A policy de update continua decidindo quem: nada de RLS mexido aqui.
grant update (assistente_ia) on table public.clinic_settings to authenticated;

-- 2. A marca da mensagem escrita pela IA ---------------------------------------
alter table public.whatsapp_messages
  add column if not exists gerada_por_ia boolean not null default false;

comment on column public.whatsapp_messages.gerada_por_ia is
  'Mensagem escrita pelo atendente com IA (Claude), e nao pelo robo de regras nem pela equipe.';

-- 3. O que a IA sabe do consultorio --------------------------------------------
--
-- No sistema do Dr. Marcello (16/10/2026) a IA respondeu "essa avaliacao e
-- medica" a uma pergunta simples sobre o servico: faltava o que qualquer
-- secretaria sabe - quem e a medica, quem ela atende, como e a consulta.
alter table public.clinic_settings
  add column if not exists assistente_ia_conhecimento text;

comment on column public.clinic_settings.assistente_ia_conhecimento is
  'Texto livre que o atendente com IA usa para responder: a medica, quem ela atende, como e a consulta. Editavel em Preferencias > Atendente com IA.';

grant update (assistente_ia_conhecimento) on table public.clinic_settings to authenticated;

-- So a clinica da Dra. Patricia (pelo nome, como em 20260924020000), e so se
-- ninguem escreveu nada ainda: texto que a equipe ja editou na tela nao e
-- sobrescrito. Texto conservador de proposito, so com o que ja esta no
-- repositorio (CLAUDE.md, respostas prontas, textos do robo): nada de preco,
-- convenio ou promessa clinica. Valor, endereco e regiao da visita vem dos
-- cartoes e das respostas prontas, que a equipe ja edita pela tela.
update public.clinic_settings cs
   set assistente_ia_conhecimento = $texto$Dra. Patrícia Zerbini, clínica médica com pós-graduação em geriatria (CRM-SP 90998, RQE 20357).

Atende adultos, com atenção especial à pessoa idosa. Crianças e adolescentes não são atendidos aqui; o indicado é um pediatra.

Onde atende: no consultório, no Gonzaga, em Santos, e em visita domiciliar, na casa do paciente.

Muitas vezes quem escreve é um familiar ou cuidador. Ele pode acompanhar a consulta, sempre com a concordância de quem vai ser atendido.

Instagram do consultório: @drapatriciazerbini.$texto$
  from public.clinics c
 where c.id = cs.clinic_id
   and c.archived_at is null
   and c.name = 'Consultório Dra. Patrícia Zerbini'
   and coalesce(trim(cs.assistente_ia_conhecimento), '') = '';

commit;
