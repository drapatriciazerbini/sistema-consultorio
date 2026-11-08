begin;

/**
 * O modelo que leva um documento (receita, 2a via, atestado) fora da janela de
 * 24 horas (07/11/2026, portado do sistema do Dr. Marcello, la 20261028200000).
 *
 * Pedido do Edu: a Dra. Patricia precisa mandar o PDF sem esperar o paciente
 * ou a familia escrever de novo. Com a janela fechada a Meta so aceita modelo
 * aprovado, e este leva o arquivo no cabecalho:
 *
 *   [documento]
 *   Ola, {{1}}. Aqui e o consultorio da Dra. Patricia Zerbini. Segue em anexo
 *   {{2}} de {{3}}. Se tiver alguma duvida, e so responder por aqui.
 *
 * Uma coluna, como a do modelo de resposta: uma versao nova aprovada na Meta
 * troca aqui sem mexer no codigo. O codigo le esta coluna a parte e, sem ela,
 * usa o nome padrao.
 */

alter table public.clinic_settings
  add column if not exists whatsapp_document_template_name text not null default 'documento_do_consultorio';

comment on column public.clinic_settings.whatsapp_document_template_name is
  'Modelo de utilidade com cabecalho Documento, para mandar PDF fora da janela de 24h. Tres parametros: quem le, o documento, o paciente.';

grant update (whatsapp_document_template_name) on table public.clinic_settings to authenticated;

commit;
