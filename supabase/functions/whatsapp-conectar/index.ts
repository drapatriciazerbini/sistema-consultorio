import { adminClient, corsHeaders, json, userClient } from '../_shared/whatsapp.ts'
import { chaveDoWhatsApp, origemDaChave } from '../_shared/whatsapp-teste.ts'
import {
  SINCRONIAS,
  clinicaDoResponsavel,
  desvioDoWebhook,
  lerContas,
  lerNumeros,
  lerPedido,
  ligacaoValeu,
  motivoDaMeta,
  numeroDaConta,
  type Passo,
} from '../_shared/conectar-numero.ts'

/**
 * Conclui a ligacao de um numero do WhatsApp a clinica (porte de 19/11/2026 do
 * sistema do Dr. Fabio, onde nasceu em 13/11/2026). As regras e o porque estao
 * em _shared/conectar-numero.ts; o passo a passo do dia esta no README,
 * "Coexistencia: passo a passo do dia".
 *
 * NADA AQUI RODA SOZINHO. A funcao so age quando o responsavel pela clinica a
 * chama, no dia em que o numero da Dra. Patricia for religado pela ECM. Ate
 * la o numero e a conta gravados em clinic_settings sao os de hoje.
 *
 * So o responsavel chama: a funcao troca o numero pelo qual a clinica inteira
 * fala (robo, lembretes da vespera, respostas da equipe). Confere a sessao e
 * depois o papel pelo servidor, com o id da pessoa, como o gastos-meta.
 *
 * acao 'listar' (padrao) { phone_number_id? }: as contas do WhatsApp que os
 * consultorios compartilharam com a ECM pelo cadastro da Meta, com os numeros
 * de cada uma. Precisa do segredo META_BUSINESS_ID (o portfolio da ECM) e de
 * uma chave que enxergue esse portfolio: a do numero informado, se houver.
 *
 * acao 'conectar' { waba_id, phone_number_id, sincronizar? }: confere o
 * numero, assina os avisos da conta (com desvio para o meta-webhook deste
 * projeto quando WHATSAPP_WEBHOOK_PROPRIO=sim), grava o numero na clinica e
 * pede contatos e historico ao celular. Devolve o numero anterior, para poder
 * desfazer chamando de novo com ele e sincronizar = false.
 *
 * A chave e a que o robo vai usar para aquele numero (chaveDoWhatsApp): o
 * segredo WHATSAPP_ACCESS_TOKEN_<phone_number_id>, ou a chave geral. Conferir
 * o numero com ELA e de proposito: se o segredo do numero novo nao foi criado
 * (ou o nome saiu errado), a chave geral nao enxerga a conta nova, a
 * conferencia falha aqui, com o nome do segredo na resposta, e nada e gravado.
 * Sem isso a ligacao "daria certo" e cada lembrete seria recusado depois.
 *
 * Um numero ja usado por outra clinica deste banco e recusado.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)

  try {
    const { data: usuario } = await userClient(autorizacao).auth.getUser()
    if (!usuario?.user?.id) return json({ error: 'Sessão obrigatória.' }, 401)

    const pedido = lerPedido(await req.json().catch(() => ({})))
    if (!pedido.ok) return json({ error: pedido.erro, code: 'PEDIDO_INVALIDO' }, 400)

    const admin = adminClient()
    const { data: vinculos, error: erroDoVinculo } = await admin
      .from('clinic_memberships')
      .select('clinic_id,role')
      .eq('user_id', usuario.user.id)
      .eq('status', 'active')
    if (erroDoVinculo) throw erroDoVinculo
    const dono = clinicaDoResponsavel(vinculos, pedido.clinicId)
    if (!dono.ok) {
      console.warn('whatsapp-conectar: chamada recusada', dono.code, usuario.user.id)
      return json({ error: dono.erro, code: dono.code }, dono.status)
    }

    const { data: ajustes, error: erroDosAjustes } = await admin
      .from('clinic_settings')
      .select('clinic_id,whatsapp_waba_id,whatsapp_phone_number_id')
      .eq('clinic_id', dono.clinicId)
      .maybeSingle()
    if (erroDosAjustes) throw erroDosAjustes
    if (!ajustes?.clinic_id) return json({ error: 'Clínica não encontrada.' }, 404)
    const anterior = {
      waba_id: ajustes.whatsapp_waba_id ?? null,
      phone_number_id: ajustes.whatsapp_phone_number_id ?? null,
    }

    const versao = Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'
    const base = `https://graph.facebook.com/${versao}`
    const CAMPOS_DO_NUMERO = 'id,display_phone_number,verified_name,is_on_biz_app'

    if (pedido.acao === 'listar') {
      const token = chaveDoWhatsApp(pedido.phoneNumberId)
      const portfolio = Deno.env.get('META_BUSINESS_ID')?.trim()
      if (!token || !portfolio) return json({ error: 'Falta configurar o portfólio da ECM (META_BUSINESS_ID).' }, 503)
      const resposta = await fetch(
        `${base}/${portfolio}/client_whatsapp_business_accounts?fields=id,name,phone_numbers{${CAMPOS_DO_NUMERO}}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const dados = await resposta.json().catch(() => null)
      if (!resposta.ok) {
        console.error('whatsapp-conectar: a Meta recusou a lista de contas', dados)
        return json(
          {
            error: `A Meta recusou a consulta: ${motivoDaMeta(dados)}`,
            code: 'META_RECUSOU',
            chave: origemDaChave(pedido.phoneNumberId),
          },
          502,
        )
      }
      return json({ ok: true, atual: anterior, chave: origemDaChave(pedido.phoneNumberId), contas: lerContas(dados) })
    }

    // conectar
    const { data: dona, error: erroDaDona } = await admin
      .from('clinic_settings')
      .select('clinic_id')
      .eq('whatsapp_phone_number_id', pedido.phoneNumberId)
      .neq('clinic_id', ajustes.clinic_id)
      .limit(1)
      .maybeSingle()
    if (erroDaDona) throw erroDaDona
    if (dona) return json({ error: 'Este número já está ligado a outra clínica.', code: 'NUMERO_EM_USO' }, 409)

    const token = chaveDoWhatsApp(pedido.phoneNumberId)
    // Diz de onde veio a chave, nunca a chave.
    const chave = origemDaChave(pedido.phoneNumberId)
    const segredoDoNumero = `WHATSAPP_ACCESS_TOKEN_${pedido.phoneNumberId}`
    if (!token) return json({ error: `Token do WhatsApp não configurado. Crie o segredo ${segredoDoNumero}.` }, 503)
    const cabecalho = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const passos: Passo[] = []

    // O desvio e conferido antes de falar com a Meta: faltando um segredo,
    // nada foi assinado nem gravado.
    const desvio = desvioDoWebhook((nome) => Deno.env.get(nome))
    if (!desvio.ok) return json({ error: desvio.erro, code: 'SEM_DESVIO' }, 503)

    // O servidor pode gravar o numero? Conferido ANTES de falar com a Meta,
    // regravando os valores de agora (nao muda nada). Na origem, em
    // 16/11/2026, a permissao faltava: os avisos da conta ja estavam
    // assinados na Meta quando o banco recusou gravar. Aqui, sem a migration
    // 20261119011000, a funcao para neste ponto e diz por que.
    const { error: erroDePermissao } = await admin
      .from('clinic_settings')
      .update({ whatsapp_waba_id: anterior.waba_id, whatsapp_phone_number_id: anterior.phone_number_id })
      .eq('clinic_id', ajustes.clinic_id)
    if (erroDePermissao) {
      console.error('whatsapp-conectar: o servidor nao pode gravar o numero em clinic_settings', erroDePermissao)
      return json(
        {
          error: `O banco ainda não deixa o servidor gravar o número (falta a migration 20261119011000): ${erroDePermissao.message ?? 'sem detalhe'}`,
          code: 'BANCO_NAO_PRONTO',
        },
        503,
      )
    }

    // 1. O numero e desta conta? (e a chave do robo enxerga a conta?)
    const consulta = await fetch(`${base}/${pedido.wabaId}/phone_numbers?fields=${CAMPOS_DO_NUMERO}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const dadosDosNumeros = await consulta.json().catch(() => null)
    const numero = consulta.ok ? numeroDaConta(lerNumeros(dadosDosNumeros), pedido.phoneNumberId) : null
    passos.push(
      numero
        ? { passo: 'Número da conta', ok: true }
        : {
            passo: 'Número da conta',
            ok: false,
            motivo: consulta.ok ? 'O número não pertence a esta conta do WhatsApp.' : motivoDaMeta(dadosDosNumeros),
          },
    )
    if (!numero) {
      console.error('whatsapp-conectar: o numero nao confere', JSON.stringify({ chave, status: consulta.status }), dadosDosNumeros)
      return json(
        {
          ok: false,
          passos,
          code: 'NUMERO_NAO_CONFERE',
          chave,
          // A causa mais provavel no dia: o segredo do numero novo nao existe
          // e a chave geral (a de antes) nao enxerga a conta da ECM.
          ...(chave === 'geral'
            ? { dica: `A chave usada foi a geral. Se este é o número novo, crie o segredo ${segredoDoNumero} com a chave do usuário do sistema da ECM e chame de novo.` }
            : {}),
        },
        409,
      )
    }

    // 2. Avisos da conta para o webhook. Com WHATSAPP_WEBHOOK_PROPRIO=sim, a
    // conta e desviada para o meta-webhook deste projeto (ver desvioDoWebhook).
    const assinatura = await fetch(`${base}/${pedido.wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: cabecalho,
      ...(desvio.desvio ? { body: JSON.stringify(desvio.desvio) } : {}),
    })
    const dadosDaAssinatura = await assinatura.json().catch(() => null)
    passos.push(
      assinatura.ok
        ? { passo: 'Avisos da conta', ok: true }
        : { passo: 'Avisos da conta', ok: false, motivo: motivoDaMeta(dadosDaAssinatura) },
    )
    if (!assinatura.ok) {
      console.error('whatsapp-conectar: a Meta recusou subscribed_apps', dadosDaAssinatura)
      return json({ ok: false, passos, code: 'META_RECUSOU', chave }, 502)
    }
    if (!desvio.desvio) {
      // Nao e erro (um app com webhook proprio dispensa o desvio), mas na
      // Central da Dra. Patricia o app e o da ECM: sem o desvio, os avisos
      // iriam para outro endereco e o robo ficaria surdo sem erro nenhum.
      console.warn('whatsapp-conectar: avisos assinados SEM desvio (WHATSAPP_WEBHOOK_PROPRIO nao esta "sim")')
    }

    // 3. Grava ANTES de pedir o historico: a Meta comeca a mandar em segundos,
    // e aviso de numero sem clinica e descartado pelo webhook.
    const { data: gravadas, error: erroAoGravar } = await admin
      .from('clinic_settings')
      .update({ whatsapp_waba_id: pedido.wabaId, whatsapp_phone_number_id: pedido.phoneNumberId })
      .eq('clinic_id', ajustes.clinic_id)
      .select('clinic_id')
    if (erroAoGravar) throw erroAoGravar
    if (!gravadas?.length) {
      // Update que nao alcanca linha nenhuma volta sem erro: gritar aqui.
      console.error('whatsapp-conectar: o numero nao foi gravado em clinic_settings', ajustes.clinic_id)
      return json({ ok: false, passos, anterior, code: 'NAO_GRAVOU', error: 'A Meta aceitou, mas o número não foi gravado na clínica.' }, 500)
    }
    passos.push({ passo: 'Número gravado na clínica', ok: true })

    // 4. Contatos e historico do celular (so na coexistencia).
    if (pedido.sincronizar && numero.noApp) {
      for (const s of SINCRONIAS) {
        const r = await fetch(`${base}/${pedido.phoneNumberId}/smb_app_data`, {
          method: 'POST',
          headers: cabecalho,
          body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: s.tipo }),
        })
        const d = await r.json().catch(() => null)
        if (!r.ok) console.error('whatsapp-conectar: a Meta recusou', s.tipo, d)
        passos.push(r.ok ? { passo: s.passo, ok: true } : { passo: s.passo, ok: false, motivo: motivoDaMeta(d) })
      }
    }

    console.info('whatsapp-conectar:', JSON.stringify({ clinica: ajustes.clinic_id, numero: pedido.phoneNumberId, anterior, chave, passos }))
    return json({
      ok: ligacaoValeu(passos),
      numero,
      anterior,
      chave,
      webhookProprio: Boolean(desvio.desvio),
      ...(desvio.desvio ? {} : { aviso: 'Os avisos da conta foram assinados sem desvio: confira o segredo WHATSAPP_WEBHOOK_PROPRIO.' }),
      passos,
    })
  } catch (causa) {
    console.error('whatsapp-conectar falhou', causa)
    // O erro do banco nao e um Error: e um objeto com message e code. Sem ler
    // a mensagem dele, a falta de permissao para gravar o numero (na origem,
    // em 16/11/2026) chegava a tela so como "Falha inesperada".
    const doBanco = (causa as { message?: unknown } | null)?.message
    const motivo = causa instanceof Error ? causa.message : typeof doBanco === 'string' && doBanco ? doBanco : 'Falha inesperada.'
    return json({ error: motivo }, 500)
  }
})
