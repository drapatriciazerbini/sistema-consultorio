/**
 * Gasto da Meta para a aba Campanha da Visao geral (07/11/2026, portado do sistema do Dr. Marcello).
 *
 * Duas portas:
 *
 *   pg_cron (x-cron-secret), de 3 em 3 horas: para cada clinica com token,
 *     tenta renovar o token se for a hora (ver _shared/gastos-meta.ts), le a
 *     conta de anuncios e grava em campanha_gastos.meta. Sempre traz o periodo
 *     inteiro desde DESDE, porque a Meta ainda ajusta o gasto de dias passados.
 *
 *   tela (sessao do usuario):
 *     conectar     dono da clinica cola o token gerado no Facebook
 *     atualizar    qualquer membro pede a busca agora (botao "Atualizar")
 *     desconectar  dono da clinica desliga
 *
 * O token so le (ads_read). Ele precisa ter sido gerado no mesmo app cujo
 * segredo esta no servidor (META_ADS_APP_ID/SECRET, ou o app do WhatsApp em
 * META_APP_ID/SECRET): a troca por 60 dias e a renovacao usam esse segredo.
 *
 * Falha barulhenta: cada recusa da Meta vai para campanha_gastos.meta_erro e
 * aparece na tela; os numeros antigos ficam.
 */
import { adminClient, corsHeaders, json, userClient } from '../_shared/whatsapp.ts'
import {
  CAMPOS_DA_CONTA,
  DESDE,
  escolherConta,
  gastoPorDiaRecente,
  hojeEmSaoPaulo,
  podeLerGasto,
  precisaRenovar,
  situacaoDaConta,
  situacaoParaGravar,
  somarInsights,
  vencimentoDoToken,
  type ContaDeAnuncios,
  type LinhaDoInsights,
  type SituacaoGravada,
} from '../_shared/gastos-meta.ts'
import { avisarEquipe } from '../_shared/push-da-equipe.ts'

type Admin = ReturnType<typeof adminClient>

type Pedido = { acao?: string; clinicId?: string; token?: string; conta?: string }

type Linha = {
  clinic_id: string
  meta_conta: string | null
  meta_token: string | null
  meta_token_expira_em: string | null
  meta_token_renovado_em: string | null
  meta_situacao?: SituacaoGravada | null
}

const GRAPH = () => `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'}`

function oApp(): { id: string; segredo: string } | null {
  const id = Deno.env.get('META_ADS_APP_ID')?.trim() || Deno.env.get('META_APP_ID')?.trim()
  const segredo = Deno.env.get('META_ADS_APP_SECRET')?.trim() || Deno.env.get('META_APP_SECRET')?.trim()
  return id && segredo ? { id, segredo } : null
}

type Resposta = { ok: true; corpo: Record<string, unknown> } | { ok: false; erro: string }

async function graph(caminho: string, params: Record<string, string>, token?: string): Promise<Resposta> {
  const url = caminho.startsWith('https://') ? caminho : `${GRAPH()}${caminho}?${new URLSearchParams(params)}`
  try {
    const resp = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    const corpo = (await resp.json().catch(() => null)) as Record<string, unknown> | null
    if (!resp.ok || !corpo) {
      const erro = (corpo?.error as { message?: string } | undefined)?.message
      return { ok: false, erro: erro ?? `a Meta respondeu ${resp.status}` }
    }
    return { ok: true, corpo }
  } catch (erro) {
    return { ok: false, erro: `sem conexão com a Meta: ${String(erro).slice(0, 120)}` }
  }
}

/** Troca o token por um de 60 dias (de 1 hora ou de 60 dias que ainda vale). */
async function trocarToken(token: string): Promise<{ ok: true; token: string; expiraEm: string | null } | { ok: false; erro: string }> {
  const app = oApp()
  if (!app) return { ok: false, erro: 'falta META_APP_ID e META_APP_SECRET no servidor' }
  const r = await graph('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: app.id,
    client_secret: app.segredo,
    fb_exchange_token: token,
  })
  if (!r.ok) return r
  const novo = String(r.corpo.access_token ?? '')
  if (!novo) return { ok: false, erro: 'a Meta não devolveu o token novo' }
  const segundos = Number(r.corpo.expires_in) || 0
  return { ok: true, token: novo, expiraEm: segundos ? new Date(Date.now() + segundos * 1000).toISOString() : null }
}

/** O que o token pode e quando vence, pelo debug_token da Meta. */
async function inspecionar(token: string): Promise<{ ok: true; escopos: unknown; expiraEm: string | null } | { ok: false; erro: string }> {
  const app = oApp()
  if (!app) return { ok: false, erro: 'falta META_APP_ID e META_APP_SECRET no servidor' }
  const r = await graph('/debug_token', { input_token: token, access_token: `${app.id}|${app.segredo}` })
  if (!r.ok) return r
  const dados = (r.corpo.data ?? {}) as { is_valid?: boolean; scopes?: unknown; expires_at?: number; data_access_expires_at?: number }
  if (!dados.is_valid) return { ok: false, erro: 'a Meta diz que este token não vale mais' }
  return { ok: true, escopos: dados.scopes, expiraEm: vencimentoDoToken(dados.expires_at, dados.data_access_expires_at) }
}

async function buscarInsights(token: string, conta: string): Promise<LinhaDoInsights[]> {
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    fields: 'ad_id,ad_name,spend',
    time_range: JSON.stringify({ since: DESDE, until: hojeEmSaoPaulo(new Date()) }),
    limit: '500',
  })
  const linhas: LinhaDoInsights[] = []
  let url: string | undefined = `${GRAPH()}/act_${conta}/insights?${params}`
  for (let pagina = 0; url && pagina < 40; pagina++) {
    const r = await graph(url, {}, token)
    if (!r.ok) throw new Error(r.erro)
    linhas.push(...((r.corpo.data as LinhaDoInsights[] | undefined) ?? []))
    url = (r.corpo.paging as { next?: string } | undefined)?.next
  }
  return linhas
}

async function gravar(admin: Admin, clinicId: string, campos: Record<string, unknown>) {
  const { error } = await admin
    .from('campanha_gastos')
    .upsert({ clinic_id: clinicId, ...campos, updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' })
  if (error) throw new Error(`não consegui gravar o gasto: ${error.message}`)
}

/**
 * Renova (se for a hora) e busca o gasto de uma clinica. Nunca lanca: o erro
 * vai para meta_erro, e os numeros antigos ficam.
 */
async function atualizarClinica(admin: Admin, linha: Linha): Promise<{ ok: boolean; erro?: string; dias?: number }> {
  if (!linha.meta_token || !linha.meta_conta) return { ok: false, erro: 'conta da Meta não conectada' }
  let token = linha.meta_token
  let aviso: string | null = null

  if (precisaRenovar(linha.meta_token_expira_em, linha.meta_token_renovado_em, Date.now())) {
    const troca = await trocarToken(token)
    if (troca.ok) {
      token = troca.token
      const expiraEm = troca.expiraEm ?? linha.meta_token_expira_em
      // O registro que diz se a renovacao de token de 60 dias anda o vencimento
      // ou nao (a Meta nao documenta; ver _shared/gastos-meta.ts).
      console.log('gastos-meta: token renovado', linha.clinic_id, 'vencia', linha.meta_token_expira_em, 'agora vence', expiraEm)
      await gravar(admin, linha.clinic_id, {
        meta_token: token,
        meta_token_expira_em: expiraEm,
        meta_token_renovado_em: new Date().toISOString(),
      }).catch((erro) => console.warn('gastos-meta: renovei mas nao gravei o token', erro))
    } else {
      console.warn('gastos-meta: nao renovei o token', linha.clinic_id, troca.erro)
      aviso = `Não consegui renovar o token da Meta (${troca.erro}). Ele ainda vale; gere outro antes de vencer.`
    }
  }

  try {
    const gasto = somarInsights(await buscarInsights(token, linha.meta_conta))
    await gravar(admin, linha.clinic_id, {
      meta: gasto,
      meta_atualizado_em: new Date().toISOString(),
      meta_erro: aviso,
      meta_erro_em: aviso ? new Date().toISOString() : null,
    })
    await atualizarSituacao(admin, linha, token, gasto.dias)
    return { ok: true, dias: Object.keys(gasto.dias).length }
  } catch (e) {
    const erro = (e as Error).message
    console.warn('gastos-meta: a Meta recusou a busca', linha.clinic_id, erro)
    await gravar(admin, linha.clinic_id, { meta_erro: erro.slice(0, 500), meta_erro_em: new Date().toISOString() }).catch((falha) =>
      console.error('gastos-meta: nem o erro consegui gravar', falha),
    )
    return { ok: false, erro }
  }
}

/**
 * A situacao da conta (07/11/2026, ver situacaoDaConta em _shared/gastos-meta.ts):
 * valor a pagar, conta bloqueada por cobranca recusada e limite de gasto
 * acabando. Lida depois do gasto e nunca derruba a busca: se falhar, fica a
 * leitura anterior e o log grita.
 *
 * Quando aparece um problema novo (a conta estava bem e deixou de estar, ou o
 * limite entrou na reta final), avisa no celular da equipe uma vez; a aba
 * Campanha mostra o alerta enquanto durar. Sem isso, cartao recusado so seria
 * notado quando alguem estranhasse a falta de familias novas.
 */
async function atualizarSituacao(admin: Admin, linha: Linha, token: string, dias: Record<string, number>) {
  const r = await graph(`/act_${linha.meta_conta}`, { fields: CAMPOS_DA_CONTA }, token)
  if (!r.ok) {
    console.warn('gastos-meta: nao li a situacao da conta', linha.clinic_id, r.erro)
    return
  }
  const agora = new Date()
  const nova = situacaoParaGravar(situacaoDaConta(r.corpo, agora), gastoPorDiaRecente(dias, hojeEmSaoPaulo(agora)))
  try {
    await gravar(admin, linha.clinic_id, { meta_situacao: nova })
  } catch (erro) {
    console.error('gastos-meta: li a situacao da conta mas nao gravei', erro)
    return
  }
  const antes = linha.meta_situacao ?? null
  const problemaNovo = nova.problema && nova.problema !== antes?.problema
  const limiteNovo = nova.limiteDias !== null && (antes?.limiteDias === null || antes?.limiteDias === undefined)
  if (problemaNovo) {
    console.error('gastos-meta: a conta de anuncios tem problema', linha.clinic_id, nova.status, nova.problema)
    await avisarEquipe(admin, linha.clinic_id, {
      titulo: '⚠️ Anúncios da Meta parados',
      corpo: nova.problema as string,
      etiqueta: 'meta-conta',
      conversa: '',
      urgente: true,
    })
  } else if (limiteNovo) {
    const texto = `O limite de gasto da conta da Meta está acabando: restam R$ ${(nova.limiteRestante ?? 0).toFixed(2).replace('.', ',')}. Quando acabar, os anúncios param.`
    console.warn('gastos-meta: limite da conta acabando', linha.clinic_id, nova.limiteRestante)
    await avisarEquipe(admin, linha.clinic_id, { titulo: '⚠️ Limite da Meta acabando', corpo: texto, etiqueta: 'meta-limite', conversa: '', urgente: false })
  }
}

const COLUNAS = 'clinic_id,meta_conta,meta_token,meta_token_expira_em,meta_token_renovado_em,meta_situacao'

async function conectar(admin: Admin, clinicId: string, pedido: Pedido, atual: Linha | null) {
  const colado = String(pedido.token ?? '').trim()
  if (colado.length < 20) return json({ error: 'Cole o token gerado no Facebook.' }, 400)

  const troca = await trocarToken(colado)
  if (!troca.ok) {
    return json(
      {
        error: `A Meta não aceitou o token: ${troca.erro}. Ele precisa ser gerado no app ${oApp()?.id ?? 'da clínica'}, com a permissão ads_read.`,
        code: 'TOKEN_RECUSADO',
      },
      400,
    )
  }
  const visto = await inspecionar(troca.token)
  if (!visto.ok) return json({ error: `A Meta não deixou conferir o token: ${visto.erro}.`, code: 'TOKEN_RECUSADO' }, 400)
  if (!podeLerGasto(visto.escopos)) {
    return json({ error: 'O token não tem a permissão ads_read. Gere outro marcando ads_read.', code: 'SEM_ADS_READ' }, 400)
  }

  const [quem, lista] = await Promise.all([
    graph('/me', { fields: 'name' }, troca.token),
    graph('/me/adaccounts', { fields: 'account_id,name', limit: '50' }, troca.token),
  ])
  if (!lista.ok) return json({ error: `Não consegui ver as contas de anúncio: ${lista.erro}.` }, 400)
  const contas: ContaDeAnuncios[] = ((lista.corpo.data as { account_id?: string; name?: string }[] | undefined) ?? []).map((c) => ({
    id: String(c.account_id ?? ''),
    nome: String(c.name ?? ''),
  }))
  const escolha = escolherConta(contas, pedido.conta, atual?.meta_conta)
  if (!escolha.ok) {
    const texto =
      escolha.motivo === 'nenhuma'
        ? 'Este Facebook não tem nenhuma conta de anúncios.'
        : escolha.motivo === 'nao_encontrada'
          ? 'A conta de anúncios ligada antes não aparece neste token. Escolha qual ler.'
          : 'Este Facebook enxerga mais de uma conta de anúncios. Escolha qual ler.'
    return json({ error: texto, code: 'ESCOLHER_CONTA', contas: escolha.contas }, 409)
  }

  const agora = new Date().toISOString()
  await gravar(admin, clinicId, {
    meta_conta: escolha.conta.id,
    meta_conta_nome: escolha.conta.nome || null,
    meta_token: troca.token,
    meta_token_de: quem.ok ? String(quem.corpo.name ?? '') || null : null,
    meta_token_expira_em: troca.expiraEm ?? visto.expiraEm,
    meta_token_renovado_em: agora,
    meta_erro: null,
    meta_erro_em: null,
  })
  const busca = await atualizarClinica(admin, {
    clinic_id: clinicId,
    meta_conta: escolha.conta.id,
    meta_token: troca.token,
    meta_token_expira_em: troca.expiraEm ?? visto.expiraEm,
    meta_token_renovado_em: agora,
  })
  return json({
    ok: true,
    conta: escolha.conta,
    expiraEm: troca.expiraEm ?? visto.expiraEm,
    aviso: busca.ok ? undefined : `Conectado, mas a primeira busca falhou: ${busca.erro}`,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const admin = adminClient()

  // ------------------------------------------------------------ pg_cron
  const segredoDoCron = req.headers.get('x-cron-secret')?.trim()
  if (segredoDoCron) {
    const esperado = Deno.env.get('CRON_SECRET')?.trim()
    if (!esperado) return json({ error: 'CRON_SECRET não configurado no servidor.' }, 503)
    if (segredoDoCron !== esperado) return json({ error: 'Não autorizado.' }, 401)
    const { data, error } = await admin.from('campanha_gastos').select(COLUNAS).not('meta_token', 'is', null)
    if (error) {
      console.error('gastos-meta: nao li campanha_gastos', error)
      return json({ error: error.message }, 500)
    }
    const resultados = []
    for (const linha of (data ?? []) as Linha[]) resultados.push({ clinica: linha.clinic_id, ...(await atualizarClinica(admin, linha)) })
    const falhas = resultados.filter((r) => !r.ok).length
    return json({ ok: falhas === 0, clinicas: resultados.length, falhas }, falhas ? 500 : 200)
  }

  // ------------------------------------------------------------ tela
  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)
    const { data: usuario } = await userClient(authorization).auth.getUser()
    if (!usuario?.user?.id) return json({ error: 'Sessão obrigatória.' }, 401)

    const pedido = (await req.json().catch(() => ({}))) as Pedido
    const clinicId = String(pedido.clinicId ?? '')
    if (!clinicId) return json({ error: 'Clínica não informada.' }, 400)

    const { data: vinculo } = await admin
      .from('clinic_memberships')
      .select('role')
      .eq('clinic_id', clinicId)
      .eq('user_id', usuario.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!vinculo) return json({ error: 'Você não faz parte desta clínica.' }, 403)
    // Gasto e dinheiro da clinica: so o dono conecta, atualiza e ve (como a RLS da tabela).
    if (vinculo.role !== 'owner') return json({ error: 'Só o responsável pela clínica mexe no gasto das campanhas.', code: 'SO_DONO' }, 403)

    const { data: atual } = await admin.from('campanha_gastos').select(COLUNAS).eq('clinic_id', clinicId).maybeSingle()

    if (pedido.acao === 'conectar') return await conectar(admin, clinicId, pedido, (atual as Linha | null) ?? null)

    if (pedido.acao === 'desconectar') {
      await gravar(admin, clinicId, { meta_token: null, meta_token_expira_em: null, meta_token_renovado_em: null, meta_erro: null, meta_erro_em: null })
      return json({ ok: true })
    }

    if (pedido.acao === 'atualizar') {
      if (!atual?.meta_token) return json({ error: 'A conta de anúncios da Meta ainda não está conectada.', code: 'SEM_TOKEN' }, 400)
      const r = await atualizarClinica(admin, atual as Linha)
      return r.ok ? json({ ok: true, dias: r.dias }) : json({ error: `A Meta recusou a busca: ${r.erro}` }, 502)
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (erro) {
    console.error('gastos-meta: falhou', erro)
    return json({ error: (erro as Error).message || 'Falha ao buscar o gasto da Meta.' }, 500)
  }
})
