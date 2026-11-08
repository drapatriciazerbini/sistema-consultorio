import { adminClient, corsHeaders, json } from '../_shared/whatsapp.ts'
import {
  AVISO_DO_MENU,
  marcaDoTexto,
  precisaDoMenuDeNovo,
  precisaDoSobre,
  type MensagemDaConversa,
} from '../_shared/depois-do-convenio.ts'
import { chaveDoWhatsApp, foraDaListaDeTeste, listaDeTeste } from '../_shared/whatsapp-teste.ts'
import { mostrarMenu } from '../_shared/atendimento.ts'
import { montarConteudo } from '../_shared/conteudo.ts'
import { postarNaMeta } from '../_shared/meta-tentativa.ts'

/**
 * "Sobre a Dra. Patricia" 6 horas depois de quem perguntou convenio ou preco,
 * ou parou no meio do pedido de consulta, e nao escreveu mais (07/11/2026,
 * portado do sistema do Dr. Marcello). E, perto de fechar a janela de 24h da
 * Meta, o menu de novo para quem continuou calado.
 *
 * Chamada pelo pg_cron a cada 10 minutos (migration
 * 20261107130000_bom_dia_e_sobre_a_dra), com x-cron-secret. A regra de quando
 * mandar mora em _shared/depois-do-convenio.ts, coberta por testes; o texto e
 * a resposta pronta com a chave "Mandar sozinha depois de convenio ou preco"
 * ligada (bot_answers.after_price_silence). Sem nenhuma ligada, nada sai.
 *
 * Falhar aqui nao pode passar calado: recusa da Meta fica gravada na conversa
 * (status failed, com o motivo) e no log, e o resumo diz quantas falharam. A
 * coluna nova faltando grita no log em vez de parecer "ninguem precisava".
 */

const GRAPH = () => Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'

/**
 * O menu do robo de novo, antes de a janela de 24h fechar (26/10/2026, ver
 * precisaDoMenuDeNovo). O mesmo menu da Central, com o aviso no lugar da
 * saudacao; a conversa volta para a etapa "menu", e o toque que vier depois o
 * robo atende. Recusa da Meta fica gravada na conversa e no log.
 */
async function mandarMenuDeNovo(
  admin: ReturnType<typeof adminClient>,
  conversa: { id: string; clinic_id: string; wa_id: string; patient_id: string | null },
  phoneNumberId: string,
  token: string,
): Promise<boolean> {
  try {
    const menu = await mostrarMenu(admin, String(conversa.id), '', AVISO_DO_MENU)
    if (!menu?.resposta) return false
    const conteudo = montarConteudo(menu.resposta, menu.lista ? { lista: menu.lista } : undefined)
    const enviadoEm = new Date().toISOString()
    const resposta = await postarNaMeta(`https://graph.facebook.com/${GRAPH()}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: conversa.wa_id, ...conteudo }),
    })
    const corpo = await resposta.json().catch(() => ({}))
    const { error: erroRegistro } = await admin.from('whatsapp_messages').insert({
      clinic_id: conversa.clinic_id,
      conversation_id: conversa.id,
      patient_id: conversa.patient_id,
      external_message_id: resposta.ok ? corpo?.messages?.[0]?.id ?? null : null,
      direction: 'outbound',
      message_type: menu.lista ? 'interactive' : 'text',
      body: menu.resposta,
      automatic: true,
      status: resposta.ok ? 'accepted' : 'failed',
      sent_at: resposta.ok ? enviadoEm : null,
      failed_at: resposta.ok ? null : enviadoEm,
      failure_reason: resposta.ok ? null : corpo?.error?.message ?? 'Meta recusou o envio.',
    })
    if (erroRegistro) console.warn('Menu de novo: enviado mas nao registrado', conversa.id, erroRegistro)
    if (!resposta.ok) console.warn('Menu de novo: Meta recusou', conversa.id, corpo?.error ?? corpo)
    return resposta.ok
  } catch (erro) {
    console.warn('Menu de novo: falhou', conversa.id, erro)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const esperado = Deno.env.get('CRON_SECRET')?.trim()
  if (!esperado) return json({ error: 'CRON_SECRET não configurado no servidor.' }, 503)
  if (req.headers.get('x-cron-secret')?.trim() !== esperado) return json({ error: 'Não autorizado.' }, 401)

  const admin = adminClient()
  const agora = new Date()
  const resumo = { enviados: 0, menus: 0, falhas: 0, conferidas: 0, semTexto: 0 }

  try {
    const { data: clinicas, error } = await admin
      .from('clinic_settings')
      .select('clinic_id,whatsapp_phone_number_id,whatsapp_autoreply_enabled')
    if (error) throw error

    for (const ajustes of clinicas ?? []) {
      const clinicId = String(ajustes.clinic_id)
      const phoneNumberId = String(ajustes.whatsapp_phone_number_id ?? '').trim()
      if (!phoneNumberId) continue
      // Robo desligado no painel do menu automatico: esta mensagem tambem e
      // do robo, e quem desligou espera silencio.
      if (ajustes.whatsapp_autoreply_enabled === false) {
        console.warn('depois-do-convenio: robo desligado na clinica; nada enviado', clinicId)
        continue
      }

      // O texto: a resposta pronta marcada para isso. Coluna nova, lida a
      // parte - sem ela, nada sai e o log diz por que.
      let texto = ''
      try {
        const { data: marcada, error: erroTexto } = await admin
          .from('bot_answers')
          .select('answer')
          .eq('clinic_id', clinicId)
          .eq('after_price_silence', true)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (erroTexto) throw erroTexto
        texto = String(marcada?.answer ?? '').trim()
      } catch (erro) {
        console.warn('Depois do convenio: nao li o texto (coluna after_price_silence?)', clinicId, erro)
        resumo.falhas++
        continue
      }
      // Sem o texto ligado, o "Sobre" nao sai - mas o menu das 23h sai do
      // mesmo jeito: ele nao depende do texto sobre a Dra.
      if (!texto) resumo.semTexto++

      const token = chaveDoWhatsApp(phoneNumberId)
      if (!token) {
        console.warn('Depois do convenio: sem token do WhatsApp para', phoneNumberId)
        resumo.falhas++
        continue
      }
      const lista = await listaDeTeste(admin, clinicId)
      const marca = texto ? marcaDoTexto(texto) : ''

      // Abertas, sem a equipe cuidando, que se mexeram dentro da janela da Meta
      // e paradas ha pelo menos 2 horas (o menor silencio das duas regras; o
      // resto quem confere e _shared/depois-do-convenio.ts).
      const { data: conversas, error: erroConversas } = await admin
        .from('whatsapp_conversations')
        .select('id,clinic_id,wa_id,patient_id,needs_attention,booking_state')
        .eq('clinic_id', clinicId)
        .eq('status', 'open')
        .gt('last_message_at', new Date(agora.getTime() - 24 * 3600 * 1000).toISOString())
        .lt('last_message_at', new Date(agora.getTime() - 2 * 3600 * 1000).toISOString())
      if (erroConversas) {
        console.warn('Depois do convenio: nao consegui ler as conversas', clinicId, erroConversas)
        resumo.falhas++
        continue
      }

      // Robo desligado so nesta conversa pela equipe (07/11/2026): esta
      // mensagem tambem e do robo. Coluna nova, lida a parte; sem ela, nenhuma
      // conversa sai desta rodada - melhor um dia sem o texto que falar com
      // quem a equipe calou.
      const roboDesligadoEm = new Set<string>()
      try {
        const ids = (conversas ?? []).map((c) => String(c.id))
        if (ids.length) {
          const { data: desligadas, error: erroDaChave } = await admin
            .from('whatsapp_conversations')
            .select('id')
            .in('id', ids)
            .not('robo_desligado_em', 'is', null)
          if (erroDaChave) throw erroDaChave
          for (const d of (desligadas ?? []) as { id: string }[]) roboDesligadoEm.add(String(d.id))
        }
      } catch (erro) {
        console.warn('Depois do convenio: sem whatsapp_conversations.robo_desligado_em; nada sai nesta rodada', clinicId, erro)
        resumo.falhas++
        continue
      }

      for (const conversa of conversas ?? []) {
        if (conversa.needs_attention) continue
        if (roboDesligadoEm.has(String(conversa.id))) continue
        if (foraDaListaDeTeste(lista, String(conversa.wa_id))) continue
        resumo.conferidas++

        // Quem pediu para nao receber mensagens.
        if (conversa.patient_id) {
          const { data: paciente } = await admin
            .from('patients')
            .select('whatsapp_opt_out_at')
            .eq('id', conversa.patient_id)
            .maybeSingle()
          if (paciente?.whatsapp_opt_out_at) continue
        }

        const { data: ultimas, error: erroMensagens } = await admin
          .from('whatsapp_messages')
          .select('direction,body,automatic,created_at')
          .eq('conversation_id', conversa.id)
          .order('created_at', { ascending: false })
          .limit(12)
        if (erroMensagens) {
          console.warn('Depois do convenio: nao li as mensagens', conversa.id, erroMensagens)
          resumo.falhas++
          continue
        }
        const mensagens = ((ultimas ?? []) as MensagemDaConversa[]).reverse()
        const etapa = (conversa as { booking_state?: string | null }).booking_state ?? null

        // O menu de novo, perto de fechar as 24h (26/10/2026).
        if (!(texto && precisaDoSobre(mensagens, agora, false, etapa))) {
          if (precisaDoMenuDeNovo(mensagens, agora, etapa)) {
            const foi = await mandarMenuDeNovo(admin, conversa, phoneNumberId, token)
            if (foi) resumo.menus++
            else resumo.falhas++
          }
          continue
        }

        // Uma vez por conversa: procura o comeco do texto no historico inteiro.
        const { data: anterior, error: erroAnterior } = await admin
          .from('whatsapp_messages')
          .select('id')
          .eq('conversation_id', conversa.id)
          .eq('direction', 'outbound')
          .like('body', `${marca.replace(/[%_]/g, '\\$&')}%`)
          .limit(1)
          .maybeSingle()
        if (erroAnterior) {
          console.warn('Depois do convenio: nao conferi se ja recebeu; nao mando', conversa.id, erroAnterior)
          resumo.falhas++
          continue
        }
        if (anterior?.id) continue

        const enviadoEm = new Date().toISOString()
        const resposta = await postarNaMeta(`https://graph.facebook.com/${GRAPH()}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: conversa.wa_id,
            type: 'text',
            text: { body: texto },
          }),
        })
        const corpo = await resposta.json().catch(() => ({}))
        const { error: erroRegistro } = await admin.from('whatsapp_messages').insert({
          clinic_id: conversa.clinic_id,
          conversation_id: conversa.id,
          patient_id: conversa.patient_id,
          external_message_id: resposta.ok ? corpo?.messages?.[0]?.id ?? null : null,
          direction: 'outbound',
          message_type: 'text',
          body: texto,
          automatic: true,
          status: resposta.ok ? 'accepted' : 'failed',
          sent_at: resposta.ok ? enviadoEm : null,
          failed_at: resposta.ok ? null : enviadoEm,
          failure_reason: resposta.ok ? null : corpo?.error?.message ?? 'Meta recusou o envio.',
        })
        if (erroRegistro) console.warn('Depois do convenio: enviado mas nao registrado', conversa.id, erroRegistro)
        if (resposta.ok) resumo.enviados++
        else {
          console.warn('Depois do convenio: Meta recusou', conversa.id, corpo?.error ?? corpo)
          resumo.falhas++
        }
      }
    }
    return json({ ok: true, ...resumo })
  } catch (erro) {
    console.error('Depois do convenio falhou', erro)
    return json({ error: 'Falha no envio depois do convênio.', ...resumo }, 500)
  }
})
