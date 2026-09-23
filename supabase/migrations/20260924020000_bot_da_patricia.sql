begin;

/**
 * O robô do WhatsApp com a voz do consultório da Dra. Patrícia (23/09/2026).
 *
 * O sistema veio de um consultório de gastroenterologia pediátrica. Lá quem
 * escreve é a mãe, sobre uma criança, e o robô fala com ela. Aqui quem escreve
 * é o próprio paciente adulto ou, muito mais vezes, a filha, o filho ou o
 * cuidador de uma pessoa idosa. As telas e as falas fixas do código já foram
 * trocadas; este arquivo põe no banco o que é conteúdo da clínica: saudação,
 * fecho, informações de cada atendimento e as respostas prontas.
 *
 * VALOR PROVISÓRIO. R$ 400,00 em tudo, por pedido de 23/09/2026, até a Dra.
 * Patrícia passar os valores de cada atendimento. Por isso o menu automático
 * CONTINUA DESLIGADO: ligar é um clique em Conversas → Menu automático, e só
 * deve acontecer depois de conferir os valores em Preferências.
 *
 * Tudo aqui entra só onde ainda está vazio, e só na clínica da Dra. Patrícia.
 * Se alguém já tiver escrito pela tela, o que foi escrito vale mais.
 *
 * Fonte dos dados que não são provisórios: o site dela (endereço do
 * consultório, atendimento em casa com região confirmada pelo endereço, "não
 * atende emergência", o que separar para a consulta).
 */

-- ---------------------------------------------------------------
-- Saudação e fecho
-- ---------------------------------------------------------------
--
-- A saudação é uma linha só: o robô cola logo abaixo "Estamos aqui para cuidar
-- de você e de quem você cuida. Como podemos ajudar hoje?" e o menu. Texto
-- longo aqui empurra as opções para fora da tela do celular.
--
-- O fecho vai no fim de toda resposta de informação. Não repete valor nem
-- endereço, que já vieram no texto do atendimento escolhido.

update public.clinic_settings cs
set whatsapp_autoreply_text = case when cs.whatsapp_autoreply_text = ''
      then 'Olá! 👋 Aqui é o consultório da Dra. Patrícia Zerbini, clínica médica e cuidado da pessoa idosa.'
      else cs.whatsapp_autoreply_text end,
    whatsapp_autoreply_known_text = case when cs.whatsapp_autoreply_known_text = ''
      then 'Olá, {nome}! 👋 Que bom falar com você de novo. Aqui é o consultório da Dra. Patrícia Zerbini.'
      else cs.whatsapp_autoreply_known_text end,
    whatsapp_menu_info_text = case when cs.whatsapp_menu_info_text = ''
      then E'⚡ *Agendar por aqui é mais rápido*: digite *2* e escolha o atendimento, o dia e o horário.\n\n' ||
           E'🙋 Quer falar com alguém da equipe? Digite *9*.\n\n' ||
           E'⏰ Segunda a sexta, 8h às 18h. Fora desse horário, respondemos no próximo dia útil.'
      else cs.whatsapp_menu_info_text end,
    telemedicine_info_text = case when cs.telemedicine_info_text = ''
      then E'💚 *Telemedicina: R$ 400,00.*\n\n' ||
           E'💻 A consulta é por vídeo, no horário marcado. Você recebe o link aqui pelo WhatsApp.\n\n' ||
           E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.\n\n' ||
           E'📋 Tenha em mãos os exames recentes, as receitas e a lista dos medicamentos em uso. Um familiar ou cuidador pode participar da chamada.'
      else cs.telemedicine_info_text end
from public.clinics c
where c.id = cs.clinic_id
  and c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini';

-- ---------------------------------------------------------------
-- Os dois atendimentos
-- ---------------------------------------------------------------
--
-- Criados aqui porque o menu pergunta "para qual atendimento" e, sem unidade
-- nenhuma, só oferecia telemedicina. Os horários de cada um continuam em
-- Agenda → Unidades: sem eles, a opção 2 responde que não há horário livre.
--
-- A visita domiciliar é uma unidade sem endereço de propósito: o endereço é o
-- da casa do paciente, e a região é confirmada antes de marcar, como o site
-- promete.

insert into public.clinic_units (clinic_id, name, address, info_text)
select c.id, v.nome, v.endereco, v.texto
from public.clinics c
cross join (values
  (
    'Consultório (Gonzaga)',
    'Rua Dr. Tolentino Filgueiras, 119, Gonzaga, Santos - SP, CEP 11060-471',
    E'💚 *Consulta no consultório: R$ 400,00.*\n\n' ||
    E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.\n\n' ||
    E'📍 Rua Dr. Tolentino Filgueiras, 119, Gonzaga, Santos.\n\n' ||
    E'📋 Traga um documento com foto, os exames recentes, as receitas e a lista dos medicamentos em uso. Um familiar ou cuidador pode acompanhar.'
  ),
  (
    'Visita domiciliar',
    '',
    E'💚 *Consulta em casa: R$ 400,00.*\n\n' ||
    E'🏠 A Dra. Patrícia vai até a casa do paciente. A região de atendimento é confirmada pelo endereço antes de marcar.\n\n' ||
    E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.\n\n' ||
    E'📋 Separe os exames recentes, as receitas e a lista dos medicamentos em uso. Um familiar ou cuidador pode participar.\n\n' ||
    E'⚠️ A visita é um atendimento programado, não de emergência. Em emergência, ligue 192 (SAMU).'
  )
) as v(nome, endereco, texto)
where c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and not exists (
    select 1 from public.clinic_units u
    where u.clinic_id = c.id and u.archived_at is null and u.name = v.nome
  );

-- ---------------------------------------------------------------
-- Respostas prontas
-- ---------------------------------------------------------------
--
-- "Valor e pagamento" pergunta antes para qual atendimento e responde o
-- texto daquele lugar, como no sistema de origem: o valor de casa e o do
-- consultorio vao ser diferentes quando os valores de verdade chegarem.
--
-- Entram ATIVAS porque só funcionam com o menu automático ligado, e ele segue
-- desligado. Quando ligar, já respondem.
--
-- Nao ha resposta pronta de emergencia de proposito: "e urgente" ja tem
-- caminho proprio no robo, que chama a equipe e marca a conversa em
-- vermelho. Uma resposta pronta aqui passaria na frente disso.
--
-- Palavras de "atende/atendem" ficaram de fora de Convênios: no sistema de
-- origem elas mandavam "vocês atendem bebê?" para o texto de convênio (caso
-- real de 18/09/2026). Aqui a pergunta equivalente é "atendem em Guarujá?", e
-- ela tem de cair em Região, não em Convênios.

insert into public.bot_answers (clinic_id, subject, keywords, answer, ask_unit, position, is_active)
select c.id, v.subject, v.keywords, v.answer, v.subject = 'Valor e pagamento', v.position, true
from public.clinics c
cross join (values
  (
    'Valor e pagamento',
    array['valor','valores','preco','preço','precos','preços','custa','custo','quanto','pagamento','pagar','pix','cartao','cartão','parcela','parcelar','recibo','nota','reembolso','particular'],
    E'💚 *Valores da consulta:*\n\n' ||
    E'• Consultório (Gonzaga): R$ 400,00\n• Em casa (visita domiciliar): R$ 400,00\n• Telemedicina: R$ 400,00\n\n' ||
    E'💳 Atendimento particular. Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano; as formas de pagamento são confirmadas no agendamento.',
    10
  ),
  (
    'Idade atendida',
    array['idade','idoso','idosa','idosos','idosas','adulto','adultos','crianca','criança','criancas','crianças','bebe','bebê','adolescente','adolescentes','pediatra','menor','anos'],
    E'👵 *Quem a Dra. Patrícia atende*\n\n' ||
    E'Adultos, com atenção especial à pessoa idosa: no consultório, em casa ou por telemedicina.\n\n' ||
    E'Crianças e adolescentes não são atendidos aqui; o indicado é um pediatra.\n\n' ||
    E'Se a sua dúvida for sobre um caso específico, digite *9* e alguém da equipe responde.',
    15
  ),
  (
    'Convênios',
    array['convenio','convênio','convenios','convênios','plano','planos','cobertura','coberto','credenciado','credenciada','carteirinha','unimed','bradesco','amil','sulamerica','sulamérica','porto','notredame','hapvida','prevent','seguros','golden','omint','careplus'],
    E'💳 *Convênios*\n\n' ||
    E'O atendimento é particular, sem convênio credenciado.\n\n' ||
    E'Emitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano. O valor devolvido depende do seu contrato.',
    20
  ),
  (
    'Região da visita domiciliar',
    array['regiao','região','regioes','regiões','bairro','cidade','domicilio','domicílio','domiciliar','casa','visita','guaruja','guarujá','vicente','praia','cubatao','cubatão','bertioga','mongagua','mongaguá','itanhaem','itanhaém','peruibe','peruíbe'],
    E'🏠 *Consulta em casa*\n\n' ||
    E'A Dra. Patrícia atende em casa, com a região confirmada pelo endereço antes de marcar.\n\n' ||
    E'Digite *9* e escreva o *bairro e a cidade* do paciente: a equipe confirma por aqui.',
    25
  ),
  (
    'Endereço do consultório',
    array['endereco','endereço','onde','local','localizacao','localização','fica','chegar','estacionamento','estacionar','mapa','rua','gonzaga','consultorio','consultório'],
    E'📍 *Consultório*\n\n' ||
    E'Rua Dr. Tolentino Filgueiras, 119, Gonzaga, Santos - SP, CEP 11060-471.\n\n' ||
    E'A Dra. Patrícia também atende em casa e por telemedicina. Digite *2* para agendar.',
    30
  ),
  (
    'O que levar e como é a consulta',
    -- Sem 'receita', 'exame' e 'remedio' de proposito: sao as palavras de quem
    -- pede 2a via de receita ou pedido de exame, que tem fluxo proprio.
    array['levar','trazer','separar','documento','documentos','primeira','duracao','duração','demora','tempo','preparo','jejum','acompanhante','cuidador','preparar'],
    E'📋 *Para a consulta*\n\n' ||
    E'Separe os exames recentes, as receitas e a lista dos medicamentos em uso. Anote as principais dúvidas e as mudanças que você percebeu na rotina.\n\n' ||
    E'Um familiar ou cuidador pode participar, sempre com a concordância de quem vai ser atendido.',
    40
  )
) as v(subject, keywords, answer, position)
where c.archived_at is null
  and c.name = 'Consultório Dra. Patrícia Zerbini'
  and not exists (
    select 1 from public.bot_answers b
    where b.clinic_id = c.id and b.subject = v.subject
  );

commit;
