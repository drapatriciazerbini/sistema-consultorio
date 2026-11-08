import { adminClient, corsHeaders, json, userClient } from '../_shared/whatsapp.ts'
import { fimDoDiaLocal } from '../_shared/lembrete.ts'
import { ESPERA_ENTRE_CLIQUES_MS, mandarLembrete, parametrosDoLembrete } from '../_shared/lembrete-envio.ts'
import { chaveDoWhatsApp } from '../_shared/whatsapp-teste.ts'

/**
 * "Repetir confirmacao" na conversa (07/11/2026, portado do sistema do Dr.
 * Marcello, onde nasceu em 29/10).
 *
 * A equipe manda de novo o lembrete da consulta, o mesmo modelo da vespera,
 * com os botoes "Confirmar presenca" e "Preciso remarcar". Por ser modelo
 * aprovado, sai mesmo com a janela de 24h fechada - que e justamente o caso
 * de quem nao respondeu o lembrete da manha (ver lembrete-envio.ts).
 *
 * O toque do paciente cai no meta-webhook como o de qualquer lembrete: a
 * mensagem vai gravada com appointment_id, e e por ela que a consulta e
 * confirmada.
 */

type Pedido = { conversationId?: string; appointmentId?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)

    const body = (await req.json().catch(() => ({}))) as Pedido
    if (!body.conversationId || !body.appointmentId) {
      return json({ error: 'Conversa ou consulta não informada.' }, 400)
    }

    // A RLS e a autorizacao, como em whatsapp-reopen: so aparece conversa de
    // clinica onde o usuario e membro ativo.
    const { data: conversa, error: erroConversa } = await userClient(authorization)
      .from('whatsapp_conversations')
      .select('id,clinic_id,patient_id,wa_id,status')
      .eq('id', body.conversationId)
      .maybeSingle()
    if (erroConversa) {
      console.error('RLS lookup failed', erroConversa)
      return json({ error: 'Falha ao verificar a conversa.', code: 'RLS_LOOKUP_FAILED' }, 500)
    }
    if (!conversa) return json({ error: 'Esta conversa não pertence à sua clínica.', code: 'NOT_VISIBLE' }, 403)
    if (conversa.status === 'opted_out') {
      return json({ error: 'Este contato pediu para não receber mensagens.', code: 'OPTED_OUT' }, 409)
    }

    const admin = adminClient()
    const { data: consulta } = await admin
      .from('appointments')
      .select('id,clinic_id,patient_id,starts_at,status,modality,contact_name,reminder_sent_at,clinic_units(name)')
      .eq('id', body.appointmentId)
      .maybeSingle()
    if (!consulta || consulta.clinic_id !== conversa.clinic_id) {
      return json({ error: 'Consulta não encontrada.', code: 'NOT_FOUND' }, 404)
    }
    if (consulta.status !== 'scheduled') {
      return json({ error: 'Esta consulta não está mais marcada.', code: 'NOT_SCHEDULED' }, 409)
    }
    if (new Date(consulta.starts_at).getTime() <= Date.now()) {
      return json({ error: 'O horário desta consulta já passou.', code: 'PAST' }, 409)
    }

    // A consulta e deste contato? Pelo cadastro, ou por ja ter mensagem dela
    // nesta conversa (marcacao pelo robo, lembrete). Sem isto, um id trocado
    // mandaria a data de um paciente para o celular de outro.
    let daConversa = Boolean(consulta.patient_id && consulta.patient_id === conversa.patient_id)
    if (!daConversa) {
      const { data: ligacao } = await admin
        .from('whatsapp_messages')
        .select('id')
        .eq('conversation_id', conversa.id)
        .eq('appointment_id', consulta.id)
        .limit(1)
      daConversa = Boolean(ligacao?.length)
    }
    if (!daConversa) {
      return json({ error: 'Esta consulta não é deste contato.', code: 'OTHER_CONTACT' }, 403)
    }

    const { data: paciente } = consulta.patient_id
      ? await admin.from('patients').select('id,name,whatsapp_opt_out_at').eq('id', consulta.patient_id).maybeSingle()
      : { data: null }
    if (paciente?.whatsapp_opt_out_at) {
      return json({ error: 'Este paciente pediu para não receber mensagens.', code: 'OPTED_OUT' }, 409)
    }

    const { data: config } = await admin
      .from('clinic_settings')
      .select(
        'whatsapp_phone_number_id,whatsapp_reminder_template_name,whatsapp_template_language,' +
          'appointment_reminder_days,clinics(timezone)',
      )
      .eq('clinic_id', conversa.clinic_id)
      .maybeSingle()
    if (!config?.whatsapp_phone_number_id) {
      return json({ error: 'Configuração do WhatsApp incompleta.', code: 'INCOMPLETE' }, 409)
    }
    const token = chaveDoWhatsApp(config.whatsapp_phone_number_id)
    if (!token) return json({ error: 'Token do WhatsApp não configurado.', code: 'NO_TOKEN' }, 503)
    const modelo = config.whatsapp_reminder_template_name || 'lembrete_consulta'
    const timezone = (config.clinics as { timezone?: string } | null)?.timezone || 'America/Sao_Paulo'

    // Clique duplo, ou duas pessoas da equipe na mesma conversa.
    const { data: ultimo } = await admin
      .from('whatsapp_messages')
      .select('created_at')
      .eq('appointment_id', consulta.id)
      .eq('direction', 'outbound')
      .eq('template_name', modelo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultimo && Date.now() - new Date(ultimo.created_at).getTime() < ESPERA_ENTRE_CLIQUES_MS) {
      return json({ error: 'O lembrete acabou de sair. Espere o paciente responder.', code: 'JUST_SENT' }, 409)
    }

    const envio = await mandarLembrete(admin, {
      clinicId: conversa.clinic_id,
      conversationId: conversa.id,
      patientId: paciente?.id ?? conversa.patient_id ?? null,
      appointmentId: consulta.id,
      waId: conversa.wa_id,
      phoneNumberId: config.whatsapp_phone_number_id,
      token,
      graphVersion: Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0',
      modelo,
      idioma: config.whatsapp_template_language || 'pt_BR',
      parametros: parametrosDoLembrete(consulta, paciente?.name || consulta.contact_name || 'paciente', timezone),
      automatico: false,
    })

    if (!envio.ok) {
      return json({
        error: envio.naoAprovado
          ? `O modelo "${modelo}" não está aprovado na Meta.`
          : 'A Meta recusou o envio. O motivo ficou na conversa.',
        code: envio.naoAprovado ? 'TEMPLATE_NOT_APPROVED' : 'META_REJECTED',
        details: envio.motivo,
      }, 502)
    }

    // Lembrete da equipe dentro da janela da vespera conta como o lembrete
    // dele: sem isto, a passada das 09:20 mandaria outro por cima do que a
    // recepcao acabou de mandar. Consulta mais longe fica como esta, e a
    // vespera ainda ganha o seu.
    if (!consulta.reminder_sent_at) {
      const fim = fimDoDiaLocal(new Date(), config.appointment_reminder_days ?? 1, timezone)
      if (new Date(consulta.starts_at).getTime() < fim.getTime()) {
        await admin
          .from('appointments')
          .update({ reminder_sent_at: envio.quando, reminder_failed_at: null, reminder_failure_reason: null })
          .eq('id', consulta.id)
      }
    }

    // So a hora da ultima mensagem: o lembrete nao tira a conversa de
    // "Concluida", como o da vespera tambem nao tira.
    await admin.from('whatsapp_conversations').update({ last_message_at: envio.quando }).eq('id', conversa.id)

    if (!envio.registrado) {
      return json({ error: 'O lembrete saiu, mas não ficou registrado na conversa.', code: 'SAVE_FAILED' }, 500)
    }
    return json({ ok: true })
  } catch (causa) {
    console.error('repetir-lembrete failed', causa)
    return json({ error: 'Falha inesperada ao mandar o lembrete.', code: 'UNEXPECTED' }, 500)
  }
})
