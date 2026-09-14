-- Textos padrao do acompanhamento, com o nome do consultorio da Dra. Patricia.
--
-- Estes textos nasceram como valor padrao das colunas, escritos para o
-- consultorio de origem. Como a clinica ainda nao existe no banco, e o padrao
-- da coluna que vai preencher a primeira linha de clinic_settings: sem trocar
-- aqui, a clinica da Dra. Patricia nasceria enviando mensagem assinada por
-- outro medico, e ninguem perceberia ate o primeiro acompanhamento sair.
--
-- Nao ha mencao a especialidade: "gastroenterologista pediatrico" nao foi
-- substituido por "geriatra" de proposito. O registro dela e de Clinica Medica
-- e a troca so deve ser feita com a palavra da medica.

alter table public.clinic_settings
  alter column template_d15 set default
    'Olá! Aqui é da equipe da Dra. Patrícia Zerbini. Já se passaram 15 dias da consulta de {nome}. Como {pronome} está se adaptando às orientações? Se surgiu qualquer dúvida, é só responder por aqui. 💙';

alter table public.clinic_settings
  alter column template_d30 set default
    'Olá! Aqui é da equipe da Dra. Patrícia Zerbini. Já se passaram 30 dias da consulta de {nome}. Como {pronome} está? Está tudo bem? Se precisar de qualquer auxílio, é só responder por aqui. 💙';

alter table public.clinic_settings
  alter column template_m90 set default
    'Olá! Aqui é da equipe da Dra. Patrícia Zerbini. Já se passaram 3 meses da consulta de {nome} e gostaríamos de saber como {pronome} está. Está tudo bem? Qualquer necessidade, estamos à disposição. 💙';

-- Se alguma linha ja tiver sido criada com o texto antigo, corrige. A condicao
-- garante que um texto escrito pela propria clinica nunca seja sobrescrito.
update public.clinic_settings
   set template_d15 = 'Olá! Aqui é da equipe da Dra. Patrícia Zerbini. Já se passaram 15 dias da consulta de {nome}. Como {pronome} está se adaptando às orientações? Se surgiu qualquer dúvida, é só responder por aqui. 💙'
 where template_d15 like '%Marcello%';

update public.clinic_settings
   set template_d30 = 'Olá! Aqui é da equipe da Dra. Patrícia Zerbini. Já se passaram 30 dias da consulta de {nome}. Como {pronome} está? Está tudo bem? Se precisar de qualquer auxílio, é só responder por aqui. 💙'
 where template_d30 like '%Marcello%';

update public.clinic_settings
   set template_m90 = 'Olá! Aqui é da equipe da Dra. Patrícia Zerbini. Já se passaram 3 meses da consulta de {nome} e gostaríamos de saber como {pronome} está. Está tudo bem? Qualquer necessidade, estamos à disposição. 💙'
 where template_m90 like '%Marcello%';
