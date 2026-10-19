import { adminClient, corsHeaders, json, userClient } from '../_shared/whatsapp.ts'
import { enviarDaEquipe, JANELA_DA_EQUIPE, registrarNoChat } from '../_shared/instagram.ts'

/**
 * Resposta da equipe no Direct do Instagram, pela Central (19/10/2026).
 *
 * O robo continua respondendo sozinho no Direct. Esta funcao e para quando a
 * equipe quer responder sem abrir o Business Suite. Ao responder, a conversa
 * fica com a equipe: o robo se cala nas horas seguintes, igual a quando a
 * resposta sai pelo Business Suite.
 *
 * A Meta so deixa responder ate 24 horas depois da ultima mensagem da pessoa.
 * A funcao recusa antes de chamar a Meta, para o aviso chegar em portugues.
 */
const LIMITE = 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)

    const body = (await req.json().catch(() => ({}))) as { conversationId?: string; text?: string }
    const texto = String(body.text ?? '').trim()
    if (!body.conversationId) return json({ error: 'Conversa não informada.' }, 400)
    if (!texto) return json({ error: 'Escreva a mensagem antes de enviar.' }, 400)
    if (texto.length > LIMITE) return json({ error: `A mensagem passa de ${LIMITE} caracteres.` }, 400)

    // A RLS e a autorizacao: so aparece conversa de clinica onde o usuario e membro.
    const { data: visivel, error: erroDaLeitura } = await userClient(authorization)
      .from('instagram_conversations')
      .select('id,clinic_id,last_inbound_at')
      .eq('id', body.conversationId)
      .maybeSingle()
    if (erroDaLeitura) {
      console.error('Instagram: falha ao conferir a conversa', erroDaLeitura)
      return json({ error: 'Falha ao verificar a conversa.' }, 500)
    }
    if (!visivel) return json({ error: 'Esta conversa não pertence à sua clínica.' }, 403)

    const ultima = visivel.last_inbound_at ? new Date(visivel.last_inbound_at).getTime() : 0
    if (!ultima || Date.now() - ultima > JANELA_DA_EQUIPE * 3_600_000) {
      return json({
        error: 'Passaram 24 horas desde a última mensagem desta pessoa: o Instagram não deixa responder pelo sistema. Responda pelo app do Instagram.',
        code: 'JANELA_FECHADA',
      }, 409)
    }

    const admin = adminClient()
    // O id da pessoa no Instagram so o servidor le.
    const { data: conversa, error: erroDaConversa } = await admin
      .from('instagram_conversations')
      .select('ig_user_id')
      .eq('id', visivel.id)
      .single()
    if (erroDaConversa) throw erroDaConversa

    // Marca antes de enviar: o eco da Meta chega em paralelo e precisa achar a
    // conversa ja com a equipe, para o robo nao falar por cima.
    const agora = new Date()
    const { error: erroDaMarca } = await admin
      .from('instagram_conversations')
      .update({ last_human_reply_at: agora.toISOString(), bot_replies_in_row: 0 })
      .eq('id', visivel.id)
    if (erroDaMarca) throw erroDaMarca

    const envio = await enviarDaEquipe(String(conversa.ig_user_id), texto)
    await registrarNoChat(admin, {
      clinicId: visivel.clinic_id,
      conversaId: visivel.id,
      direcao: 'outbound',
      autor: 'equipe',
      texto,
      mid: envio.mid,
      ...(envio.mid ? {} : { status: 'falhou' as const, erro: envio.erro }),
    }, agora)
    if (!envio.mid) return json({ error: `O Instagram recusou o envio: ${envio.erro ?? 'sem detalhe'}` }, 502)
    return json({ ok: true })
  } catch (erro) {
    console.error('Instagram: resposta da equipe falhou', erro)
    return json({ error: 'Não foi possível enviar agora. Tente de novo.' }, 500)
  }
})
