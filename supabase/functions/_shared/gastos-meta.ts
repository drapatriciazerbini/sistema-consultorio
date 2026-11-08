/**
 * Gasto da conta de anuncios da Meta, sem ninguem digitar (07/11/2026,
 * portado do sistema do Dr. Marcello, onde entrou em 04/11).
 *
 * A funcao gastos-meta usa estas contas; elas ficam aqui, sem import nem Deno,
 * para os testes rodarem no Node (tests/gastos-meta.test.mjs).
 *
 * O token. O token de usuario dura 60 dias. A Meta so documenta a troca de 1
 * hora para 60 dias; trocar de novo um token que ja e de 60 dias funciona para
 * uns e devolve o mesmo vencimento para outros. Por isso a funcao tenta renovar
 * uma vez por semana enquanto ele vale, e a tela mostra o vencimento: se a data
 * andar, ninguem precisa mexer; se nao andar, a tela avisa antes de vencer. A
 * conta da Dra. fica no portfolio "Patricia Zerbini"; um token de usuario do
 * sistema (sem vencimento, expiraEm nulo) tambem serve, e ai nada se renova.
 */

/** Primeiro dia que a busca traz: o Google da Dra. ja tinha gasto em setembro de 2026. */
export const DESDE = '2026-09-01'

/** Tentar renovar uma vez por semana: a Meta aceita no maximo uma troca por dia. */
export const RENOVAR_A_CADA_DIAS = 7

/** A tela comeca a avisar quando faltam estes dias para o token vencer. */
export const AVISAR_ANTES_DIAS = 10

const DIA = 24 * 3600 * 1000

/** Uma linha de /act_<conta>/insights com level=ad e time_increment=1. */
export type LinhaDoInsights = {
  ad_id?: string
  ad_name?: string
  spend?: string | number
  date_start?: string
}

export type GastoMeta = {
  /** "2026-11-03": gasto do dia, igual ao do Gerenciador (sem o imposto cobrado a parte). */
  dias: Record<string, number>
  /** Codigo do anuncio: nome no Gerenciador e gasto por dia. */
  anuncios: Record<string, { nome: string; dias: Record<string, number> }>
}

const centavos = (n: number) => Math.round(n * 100) / 100

/**
 * Soma as linhas da Meta por dia e por anuncio. Dia sem gasto nao entra: a
 * Meta devolve linha com spend "0" para anuncio pausado, e isso so engorda o
 * que vai para o banco.
 */
export function somarInsights(linhas: LinhaDoInsights[]): GastoMeta {
  const dias: GastoMeta['dias'] = {}
  const anuncios: GastoMeta['anuncios'] = {}
  for (const l of linhas) {
    const valor = Number(l.spend)
    const dia = String(l.date_start ?? '')
    if (!valor || !Number.isFinite(valor) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue
    dias[dia] = centavos((dias[dia] ?? 0) + valor)
    const id = String(l.ad_id ?? '').trim() || 'sem-codigo'
    const anuncio = (anuncios[id] ??= { nome: String(l.ad_name ?? '').trim() || 'Anúncio sem nome', dias: {} })
    anuncio.dias[dia] = centavos((anuncio.dias[dia] ?? 0) + valor)
  }
  return { dias, anuncios }
}

/** Hoje em Sao Paulo (UTC-3, sem horario de verao desde 2019), o fuso da conta de anuncios. */
export function hojeEmSaoPaulo(agora: Date): string {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * Hora de tentar renovar? So enquanto o token vale (vencido, a Meta recusa a
 * troca e e preciso gerar outro) e no maximo uma vez por semana. Token sem
 * vencimento (expiraEm nulo, como o de usuario do sistema) nao se renova.
 */
export function precisaRenovar(expiraEm: string | null | undefined, renovadoEm: string | null | undefined, agora: number): boolean {
  if (!expiraEm) return false
  const expira = Date.parse(expiraEm)
  if (!Number.isFinite(expira) || expira <= agora) return false
  const renovado = renovadoEm ? Date.parse(renovadoEm) : NaN
  if (!Number.isFinite(renovado)) return true
  return agora - renovado >= RENOVAR_A_CADA_DIAS * DIA
}

/**
 * O vencimento que o debug_token da Meta informa. expires_at = 0 quer dizer
 * "nao vence"; ai vale o data_access_expires_at, se vier, que e quando a
 * pessoa precisa entrar de novo para o app continuar lendo.
 */
export function vencimentoDoToken(expiresAt?: number | null, dataAccessExpiresAt?: number | null): string | null {
  const segundos = [Number(expiresAt) || 0, Number(dataAccessExpiresAt) || 0].filter((n) => n > 0)
  if (!segundos.length) return null
  return new Date(Math.min(...segundos) * 1000).toISOString()
}

/** Ler gasto exige ads_read (ou ads_management, que inclui a leitura). */
export function podeLerGasto(escopos: unknown): boolean {
  return Array.isArray(escopos) && escopos.some((e) => e === 'ads_read' || e === 'ads_management')
}

export type ContaDeAnuncios = { id: string; nome: string }

export type ContaEscolhida =
  | { ok: true; conta: ContaDeAnuncios }
  | { ok: false; motivo: 'nenhuma' | 'escolher' | 'nao_encontrada'; contas: ContaDeAnuncios[] }

/**
 * Qual conta de anuncios ler. O token pode enxergar mais de uma (a pessoal e a
 * de outra empresa onde a pessoa anuncia): com uma so, e ela; com varias, a
 * que a tela pediu, ou a que ja estava ligada. Nunca a primeira da lista por
 * sorte - gasto da conta errada e pior que gasto nenhum.
 */
export function escolherConta(contas: ContaDeAnuncios[], pedida?: string | null, atual?: string | null): ContaEscolhida {
  const limpa = (id?: string | null) => String(id ?? '').replace(/^act_/, '').trim()
  if (!contas.length) return { ok: false, motivo: 'nenhuma', contas }
  const alvo = limpa(pedida) || limpa(atual)
  if (alvo) {
    const achada = contas.find((c) => limpa(c.id) === alvo)
    if (achada) return { ok: true, conta: { ...achada, id: limpa(achada.id) } }
    // A conta que ja estava ligada sumiu deste token (outra pessoa gerou?):
    // trocar sozinho para a conta que sobrou misturaria gasto de outro anuncio.
    return { ok: false, motivo: 'nao_encontrada', contas }
  }
  if (contas.length === 1) return { ok: true, conta: { ...contas[0], id: limpa(contas[0].id) } }
  return { ok: false, motivo: 'escolher', contas }
}

/**
 * Situacao da conta de anuncios (07/11/2026).
 *
 * Pedido do Edu: "trazer o saldo que ta na campanha do Meta disponivel e que
 * avise quando estiver acabando". A conta da Dra. e pos-paga no cartao: a Meta
 * cobra sozinha quando o valor a pagar chega no limite de cobranca ou na data
 * marcada (em 07/11: R$ 41,61 a pagar, cobranca ao chegar em R$ 119). Nao ha
 * credito pre-pago para acabar. O que para os anuncios e a cobranca recusada,
 * que a Meta mostra no account_status, e o limite de gasto da conta
 * (spend_cap), quando alguem define um no Gerenciador. E isso que se le aqui.
 *
 * balance, amount_spent e spend_cap vem em centavos (a menor unidade da
 * moeda), ao contrario do spend dos insights, que vem em reais.
 */
export type SituacaoDaContaMeta = {
  /** Valor a pagar ate a proxima cobranca, em reais, sem o imposto. */
  aPagar: number | null
  /** account_status da Meta: 1 e conta ativa. */
  status: number | null
  /** disable_reason da Meta, quando a conta foi desativada. */
  motivo: number | null
  /** Limite de gasto da conta (spend_cap), em reais; nulo quando nao ha limite. */
  limite: number | null
  /** Gasto da conta que conta para o limite (amount_spent), em reais. */
  gastoTotal: number | null
  lidoEm: string
}

/** Os campos pedidos a /act_<conta>; todos leem com ads_read. */
export const CAMPOS_DA_CONTA = 'account_status,disable_reason,balance,amount_spent,spend_cap,currency'

function emReais(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? centavos(n / 100) : null
}

export function situacaoDaConta(corpo: Record<string, unknown>, agora: Date): SituacaoDaContaMeta {
  const status = corpo.account_status === undefined || corpo.account_status === null ? NaN : Number(corpo.account_status)
  const motivo = Number(corpo.disable_reason)
  const limite = emReais(corpo.spend_cap)
  return {
    aPagar: emReais(corpo.balance),
    status: Number.isFinite(status) ? status : null,
    motivo: Number.isFinite(motivo) && motivo > 0 ? motivo : null,
    // spend_cap "0" quer dizer conta sem limite
    limite: limite && limite > 0 ? limite : null,
    gastoTotal: emReais(corpo.amount_spent),
    lidoEm: agora.toISOString(),
  }
}

/**
 * O que o account_status quer dizer para quem anuncia, em uma frase; nulo com
 * a conta rodando normal. Codigos da Meta: 1 ACTIVE, 2 DISABLED, 3 UNSETTLED,
 * 7 PENDING_RISK_REVIEW, 8 PENDING_SETTLEMENT, 9 IN_GRACE_PERIOD,
 * 100 PENDING_CLOSURE, 101 CLOSED, 201 ANY_ACTIVE, 202 ANY_CLOSED.
 */
export function problemaDaConta(s: Pick<SituacaoDaContaMeta, 'status'> | null | undefined): string | null {
  if (!s || s.status === null || s.status === undefined) return null
  switch (s.status) {
    case 1:
    case 201:
      return null
    case 2:
      return 'A Meta desativou a conta de anúncios da Dra.: os anúncios pararam. Veja o motivo no Gerenciador de Anúncios.'
    case 3:
      return 'A Meta não conseguiu cobrar o cartão: os anúncios pararam até o pagamento sair. Confira em Cobrança e pagamentos.'
    case 7:
      return 'A Meta está revisando a conta de anúncios: os anúncios podem estar parados até a revisão acabar.'
    case 8:
      return 'A Meta está acertando um pagamento da conta de anúncios. Confira em Cobrança e pagamentos.'
    case 9:
      return 'Pagamento atrasado na Meta: pague em Cobrança e pagamentos antes que os anúncios parem.'
    case 100:
    case 101:
    case 202:
      return 'A conta de anúncios da Meta está fechada (ou fechando): nenhum anúncio roda nela.'
    default:
      return `A Meta mostra a conta de anúncios com a situação ${s.status}. Confira no Gerenciador de Anúncios.`
  }
}

/** Avisar quando o que resta do limite da conta der para menos destes dias, no ritmo atual. */
export const LIMITE_AVISAR_DIAS = 3

/**
 * O limite de gasto da conta esta acabando? So existe quando alguem definiu um
 * limite no Gerenciador (sem limite, nao ha o que acabar). Avisa quando o que
 * resta cobre menos de LIMITE_AVISAR_DIAS no ritmo dos ultimos dias, ou quando
 * ja acabou (a Meta para os anuncios ao chegar no limite).
 */
export function limiteAcabando(
  s: Pick<SituacaoDaContaMeta, 'limite' | 'gastoTotal'> | null | undefined,
  gastoPorDia: number,
): { restante: number; dias: number | null } | null {
  if (!s?.limite || s.gastoTotal === null || s.gastoTotal === undefined) return null
  const restante = centavos(Math.max(0, s.limite - s.gastoTotal))
  const dias = gastoPorDia > 0 ? restante / gastoPorDia : null
  if (restante <= 0) return { restante: 0, dias: 0 }
  if (dias !== null && dias < LIMITE_AVISAR_DIAS) return { restante, dias }
  return null
}

/**
 * Gasto medio por dia nos ultimos `n` dias fechados (hoje fica de fora: o dia
 * ainda esta correndo e puxaria a media para baixo).
 */
export function gastoPorDiaRecente(dias: Record<string, number>, hoje: string, n = 7): number {
  const fim = Date.parse(`${hoje}T12:00:00Z`)
  let total = 0
  for (let i = 1; i <= n; i++) {
    const dia = new Date(fim - i * DIA).toISOString().slice(0, 10)
    total += Number(dias[dia]) || 0
  }
  return centavos(total / n)
}

/** O que a tela le de campanha_gastos.meta_situacao: a leitura e o que ela quer dizer. */
export type SituacaoGravada = SituacaoDaContaMeta & {
  problema: string | null
  limiteRestante: number | null
  limiteDias: number | null
}

export function situacaoParaGravar(s: SituacaoDaContaMeta, gastoPorDia: number): SituacaoGravada {
  const acabando = limiteAcabando(s, gastoPorDia)
  return {
    ...s,
    problema: problemaDaConta(s),
    limiteRestante: acabando?.restante ?? (s.limite && s.gastoTotal !== null ? centavos(Math.max(0, s.limite - s.gastoTotal)) : null),
    limiteDias: acabando ? (acabando.dias === null ? null : Math.floor(acabando.dias * 10) / 10) : null,
  }
}
