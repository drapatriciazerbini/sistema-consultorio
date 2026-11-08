import { adminClient, corsHeaders, json, userClient } from '../_shared/whatsapp.ts'
import { chaveDoWhatsApp } from '../_shared/whatsapp-teste.ts'
import { bloquearNoWhatsApp } from '../_shared/bloqueio.ts'

/**
 * Botao "Bloquear contato" da conversa (07/11/2026, do sistema do Dr.
 * Marcello). Ver _shared/bloqueio.ts.
 *
 * Bloquear: pede o bloqueio a Meta e, aceito ou nao, bloqueia na Central - o
 * que a equipe quer e silencio, e isso a Central garante sozinha. A resposta
 * diz se o WhatsApp tambem bloqueou, e por que nao, para a tela mostrar.
 *
 * Desbloquear: se a Meta tinha bloqueado, desbloqueia la primeiro. Se ela
 * recusar, o contato continua bloqueado aqui tambem: liberar so a Central com
 * o numero ainda barrado no WhatsApp mostraria "desbloqueado" para quem nao
 * consegue escrever.
 */

type Pedido = { conversationId?: string; bloquear?: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)

    const body = (await req.json().catch(() => ({}))) as Pedido
    if (!body.conversationId || typeof body.bloquear !== 'boolean') {
      return json({ error: 'Conversa não informada.' }, 400)
    }
    const bloquear = body.bloquear

    // A RLS e a autorizacao, como em repetir-lembrete: so aparece conversa de
    // clinica onde o usuario e membro ativo.
    const { data: conversa, error: erroConversa } = await userClient(authorization)
      .from('whatsapp_conversations')
      .select('id,clinic_id,wa_id')
      .eq('id', body.conversationId)
      .maybeSingle()
    if (erroConversa) {
      console.error('RLS lookup failed', erroConversa)
      return json({ error: 'Falha ao verificar a conversa.' }, 500)
    }
    if (!conversa) return json({ error: 'Esta conversa não pertence à sua clínica.' }, 403)
    if (!conversa.wa_id) return json({ error: 'Esta conversa não tem número de WhatsApp.' }, 409)

    const admin = adminClient()

    // Coluna nova, lida a parte: sem ela, a migration ainda nao rodou.
    const { data: estado, error: erroEstado } = await admin
      .from('whatsapp_conversations')
      .select('bloqueado_em,bloqueado_no_whatsapp')
      .eq('id', conversa.id)
      .maybeSingle()
    if (erroEstado) {
      console.error('Sem whatsapp_conversations.bloqueado_em', erroEstado)
      return json({ error: 'O sistema ainda está sendo atualizado. Tente de novo em alguns minutos.' }, 503)
    }
    const jaNoWhatsApp = Boolean((estado as { bloqueado_no_whatsapp?: boolean } | null)?.bloqueado_no_whatsapp)

    const { data: ajustes } = await admin
      .from('clinic_settings')
      .select('whatsapp_phone_number_id')
      .eq('clinic_id', conversa.clinic_id)
      .maybeSingle()
    const phoneNumberId = String(ajustes?.whatsapp_phone_number_id ?? '')
    const token = phoneNumberId ? chaveDoWhatsApp(phoneNumberId) : ''
    const versao = Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'

    const naMeta = (bloquearAgora: boolean) =>
      phoneNumberId && token
        ? bloquearNoWhatsApp({ fetch, versao, phoneNumberId, token, waId: conversa.wa_id, bloquear: bloquearAgora })
        : Promise.resolve({ ok: false as const, codigo: null, motivo: 'O WhatsApp da clínica não está configurado.' })

    if (bloquear) {
      // Ja bloqueado no WhatsApp: nao pede de novo, so garante a Central.
      const meta = jaNoWhatsApp ? { ok: true as const } : await naMeta(true)
      const { error: erroGravar } = await admin
        .from('whatsapp_conversations')
        .update({
          bloqueado_em: (estado as { bloqueado_em?: string | null } | null)?.bloqueado_em ?? new Date().toISOString(),
          bloqueado_no_whatsapp: meta.ok,
          // Some da lista de quem espera a clinica: e o mesmo efeito do
          // "Concluir conversa", com a etiqueta "Tentou falar" apagada.
          status: 'resolved',
          needs_attention: false,
          attention_reason: null,
          unread_count: 0,
        })
        .eq('id', conversa.id)
      if (erroGravar) {
        console.error('Nao consegui gravar o bloqueio', erroGravar)
        return json({ error: 'Não foi possível bloquear o contato.' }, 500)
      }
      await registrar(admin, conversa.clinic_id, conversa.id, 'contato_bloqueado', meta.ok ? 'whatsapp' : `so_central:${meta.codigo ?? 'sem_codigo'}`)
      return json({ bloqueado: true, noWhatsApp: meta.ok, motivo: meta.ok ? null : meta.motivo })
    }

    // Desbloquear.
    if (jaNoWhatsApp) {
      const meta = await naMeta(false)
      if (!meta.ok) {
        return json(
          { error: `O WhatsApp não desbloqueou: ${meta.motivo} O contato continua bloqueado.`, bloqueado: true, noWhatsApp: true },
          502,
        )
      }
    }
    const { error: erroLiberar } = await admin
      .from('whatsapp_conversations')
      .update({ bloqueado_em: null, bloqueado_no_whatsapp: false })
      .eq('id', conversa.id)
    if (erroLiberar) {
      console.error('Nao consegui gravar o desbloqueio', erroLiberar)
      return json({ error: 'Não foi possível desbloquear o contato.' }, 500)
    }
    await registrar(admin, conversa.clinic_id, conversa.id, 'contato_desbloqueado', jaNoWhatsApp ? 'whatsapp' : 'so_central')
    return json({ bloqueado: false, noWhatsApp: false, motivo: null })
  } catch (erro) {
    console.error('whatsapp-bloqueio falhou', erro)
    return json({ error: 'Não foi possível mudar o bloqueio deste contato.' }, 500)
  }
})

/** Rastro em whatsapp_bot_events, para saber depois quando e como foi. */
async function registrar(
  admin: ReturnType<typeof adminClient>,
  clinicId: string,
  conversaId: string,
  evento: string,
  detalhe: string,
) {
  const { error } = await admin
    .from('whatsapp_bot_events')
    .insert({ clinic_id: clinicId, conversation_id: conversaId, evento, detalhe: detalhe.slice(0, 120) })
  if (error) console.warn('Nao consegui registrar o evento', evento, error)
}
