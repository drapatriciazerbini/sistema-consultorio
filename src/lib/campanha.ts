/**
 * As contas da aba Campanha da Visao geral (07/11/2026, portadas do sistema do
 * Dr. Marcello, onde entraram em 04/11).
 *
 * Pedido do Edu: "quero fazer o botao de campanha igual do Marcelo, que mostra
 * todo o gerenciamento com todos os indicadores". A aba Google contava quem
 * chegou pelo anuncio; esta junta o dinheiro: investimento, custo por contato,
 * custo por consulta e por paciente que veio, o funil, o ritmo por dia, as
 * plataformas e os anuncios.
 *
 * Sem import: os testes rodam estas contas direto no Node
 * (tests/campanha.test.mjs).
 */

export type Plataforma = 'meta' | 'google' | 'organico'
export type Filtro = 'pago' | 'todos' | Plataforma

export const PLATAFORMAS: Plataforma[] = ['meta', 'google', 'organico']
export const PAGAS: Plataforma[] = ['meta', 'google']

export interface Contato {
  conversaId: string
  nome: string
  telefone: string
  plataforma: Plataforma
  /** Origem crua do webhook (instagram, facebook, meta, google), nula no organico. */
  origem: 'instagram' | 'facebook' | 'meta' | 'google' | null
  /** Quando chegou: a mensagem do anuncio, ou a primeira mensagem no organico. */
  chegouEm: string
  anuncioId: string | null
  tituloDoAnuncio: string | null
  /** Escreveu mais de uma vez: passou do primeiro "oi". */
  respondeu: boolean
  /** Inicio da consulta marcada depois da chegada (a que vale, ou a cancelada). */
  consultaEm: string | null
  consultaMarcadaEm: string | null
  consultaCancelada: boolean
  /** A consulta aconteceu (status attended na agenda). */
  veio: boolean
}

export interface GastoMetaSalvo {
  dias?: Record<string, number>
  anuncios?: Record<string, { nome: string; dias: Record<string, number> }>
}

export interface GastosDaCampanha {
  metaConta: string | null
  metaContaNome: string | null
  metaTokenDe: string | null
  metaTokenExpiraEm: string | null
  metaTokenRenovadoEm: string | null
  meta: GastoMetaSalvo
  metaAtualizadoEm: string | null
  metaErro: string | null
  /** "2026-10": gasto do Google no mes (no mes corrente, ate o dia lancado). */
  google: Record<string, number>
  googleAtualizadoEm: string | null
  /**
   * Gasto do Google por dia, mandado pelo script da conta (05/11/2026). Nulo
   * antes da migration ou sem script; ai vale so o lancado a mao.
   */
  googleAuto: GastoGoogleSalvo | null
  googleAutoEm: string | null
  googleConta: string | null
  googleErro: string | null
  googleErroEm: string | null
  /** Quando a chave do script foi gerada: com ela e sem relatorio, falta colar o script. */
  googleChaveCriadaEm: string | null
  /**
   * Situacao da conta de anuncios da Meta (07/11/2026), gravada pela funcao
   * gastos-meta junto com o gasto. Nula antes da primeira leitura.
   */
  metaSituacao: SituacaoDaContaMeta | null
}

/**
 * O que a funcao gastos-meta grava em campanha_gastos.meta_situacao (ver
 * supabase/functions/_shared/gastos-meta.ts, situacaoParaGravar). A conta da
 * Dra. e pos-paga no cartao: aPagar e o que a Meta cobra na proxima cobranca,
 * nao um credito que acaba.
 */
export interface SituacaoDaContaMeta {
  aPagar: number | null
  status: number | null
  limite: number | null
  gastoTotal: number | null
  lidoEm: string
  problema: string | null
  limiteRestante: number | null
  limiteDias: number | null
}

export interface GastoGoogleSalvo {
  /** Primeiro dia que o script le: dai em diante o valor lancado a mao deixa de contar. */
  desde?: string
  ate?: string
  dias?: Record<string, number>
  campanhas?: Record<string, { nome: string; dias: Record<string, number> }>
}

export interface Janela {
  inicio: number
  fim: number
  /** "2026-10" quando a janela e um mes fechado. */
  mes?: string
}

const DIA = 24 * 3600 * 1000

const centavos = (n: number) => Math.round(n * 100) / 100

function meiaNoite(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Os ultimos N dias, contando hoje inteiro. */
export function janelaDosUltimos(dias: number, agora: number): Janela {
  const amanha = meiaNoite(agora) + DIA
  return { inicio: amanha - dias * DIA, fim: amanha }
}

/** O mes "2026-10" inteiro, do dia 1 a meia-noite do dia 1 seguinte. */
export function janelaDoMes(mes: string): Janela {
  const [a, m] = mes.split('-').map(Number)
  return { inicio: new Date(a, m - 1, 1).getTime(), fim: new Date(a, m, 1).getTime(), mes }
}

/** A janela de mesmo tamanho logo antes, para comparar. */
export function janelaAnterior(j: Janela): Janela {
  if (j.mes) {
    const [a, m] = j.mes.split('-').map(Number)
    const antes = new Date(a, m - 2, 1)
    return janelaDoMes(`${antes.getFullYear()}-${String(antes.getMonth() + 1).padStart(2, '0')}`)
  }
  return { inicio: j.inicio - (j.fim - j.inicio), fim: j.inicio }
}

export function chaveDoMes(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function naJanela<T extends { chegouEm: string }>(lista: T[], j: Janela): T[] {
  return lista.filter((c) => {
    const t = Date.parse(c.chegouEm)
    return t >= j.inicio && t < j.fim
  })
}

export function plataformasDoFiltro(filtro: Filtro): Plataforma[] {
  if (filtro === 'pago') return PAGAS
  if (filtro === 'todos') return PLATAFORMAS
  return [filtro]
}

/**
 * A consulta que conta para quem chegou (04/11/2026). Antes so valia a marcada
 * NA conversa do anuncio (appointments.conversation_id): a familia que chegou
 * pelo anuncio e marcou por telefone, ou pela recepcao, aparecia como "sem
 * consulta". Agora vale tambem a consulta do paciente da conversa.
 *
 * So a marcada depois da chegada: paciente antigo que clicou no anuncio nao
 * vira conversao por causa de uma consulta de setembro.
 */
export interface ConsultaMarcada {
  conversationId: string | null
  patientId: string | null
  startsAt: string
  createdAt: string
  status: 'scheduled' | 'attended' | 'cancelled' | 'no_show'
}

export function consultaDepoisDaChegada(
  consultas: ConsultaMarcada[],
  conversaId: string,
  patientId: string | null,
  chegouEm: string,
): { consultaEm: string | null; marcadaEm: string | null; cancelada: boolean; veio: boolean } {
  const chegada = Date.parse(chegouEm)
  const dela = consultas
    .filter((c) => c.conversationId === conversaId || (patientId !== null && c.patientId === patientId))
    .filter((c) => Date.parse(c.createdAt) >= chegada)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const valendo = dela.find((c) => c.status !== 'cancelled')
  const escolhida = valendo ?? dela[0] ?? null
  return {
    consultaEm: escolhida?.startsAt ?? null,
    marcadaEm: escolhida?.createdAt ?? null,
    cancelada: Boolean(escolhida && !valendo),
    veio: dela.some((c) => c.status === 'attended'),
  }
}

export interface Numeros {
  contatos: number
  responderam: number
  marcaram: number
  vieram: number
}

/** Marcou = tem consulta que vale (ou que ja aconteceu); a que cancelou nao conta. */
export function marcou(c: Contato): boolean {
  return Boolean(c.consultaEm && !c.consultaCancelada) || c.veio
}

export function numeros(lista: Contato[]): Numeros {
  return {
    contatos: lista.length,
    responderam: lista.filter((c) => c.respondeu).length,
    marcaram: lista.filter(marcou).length,
    vieram: lista.filter((c) => c.veio).length,
  }
}

/** Meio-dia local: a virada de fuso nao joga o gasto para o dia vizinho. */
function meioDia(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d, 12).getTime()
}

function somaDosDias(dias: Record<string, number> | undefined, j: Janela): number {
  let total = 0
  for (const [dia, valor] of Object.entries(dias ?? {})) {
    const t = meioDia(dia)
    if (t >= j.inicio && t < j.fim) total += Number(valor) || 0
  }
  return total
}

export function gastoMetaNaJanela(meta: GastoMetaSalvo | null | undefined, j: Janela): number {
  return centavos(somaDosDias(meta?.dias, j))
}

export function gastoDoAnuncioNaJanela(meta: GastoMetaSalvo | null | undefined, anuncioId: string, j: Janela): number {
  return centavos(somaDosDias(meta?.anuncios?.[anuncioId]?.dias, j))
}

/** Meia-noite local do primeiro dia que o script le; nulo sem script. */
function inicioDoAutomatico(auto: GastoGoogleSalvo | null | undefined): number | null {
  if (!auto?.desde || !/^\d{4}-\d{2}-\d{2}$/.test(auto.desde)) return null
  const [a, m, d] = auto.desde.split('-').map(Number)
  return new Date(a, m - 1, d).getTime()
}

/**
 * Gasto do Google na janela.
 *
 * Automatico (05/11/2026): o custo de cada dia que o script mandou, como na
 * Meta. Lancado a mao: o mes fechado se espalha pelos dias dele; o mes
 * corrente, so pelos dias ja passados (o valor lancado e "ate hoje"). Fora
 * disso seria 7 dias de novembro valerem 7/30 de um gasto que so cobre 4 dias.
 *
 * Os dois nao somam: do primeiro dia que o script le em diante, so o script
 * vale. O lancado a mao fica para antes dele - senao o mes de outubro, lancado
 * a mao em 30/10 e lido pelo script desde 01/10, contaria em dobro.
 */
export function gastoGoogleNaJanela(
  google: Record<string, number> | null | undefined,
  j: Janela,
  agora: number,
  auto?: GastoGoogleSalvo | null,
): number {
  const amanha = meiaNoite(agora) + DIA
  const inicioAuto = inicioDoAutomatico(auto)
  let total = inicioAuto === null ? 0 : somaDosDias(auto?.dias, j)
  for (const [mes, valor] of Object.entries(google ?? {})) {
    if (!/^\d{4}-\d{2}$/.test(mes) || !(Number(valor) > 0)) continue
    const m = janelaDoMes(mes)
    const fimDoMes = Math.min(m.fim, amanha)
    const duracao = fimDoMes - m.inicio
    if (duracao <= 0) continue
    // So a parte do mes antes do script conta; o valor do mes se espalha pelo mes inteiro lancado
    const fimDoValor = inicioAuto === null ? fimDoMes : Math.min(fimDoMes, inicioAuto)
    const sobre = Math.max(0, Math.min(j.fim, fimDoValor) - Math.max(j.inicio, m.inicio))
    total += (Number(valor) * sobre) / duracao
  }
  return centavos(total)
}

export function investimento(gastos: GastosDaCampanha | null, j: Janela, plataformas: Plataforma[], agora: number): number {
  if (!gastos) return 0
  let total = 0
  if (plataformas.includes('meta')) total += gastoMetaNaJanela(gastos.meta, j)
  if (plataformas.includes('google')) total += gastoGoogleNaJanela(gastos.google, j, agora, gastos.googleAuto)
  return centavos(total)
}

export function divisao(valor: number, por: number): number | null {
  return valor > 0 && por > 0 ? valor / por : null
}

/** Variacao entre periodos; nula quando nao ha base para comparar. */
export function variacao(agora: number | null, antes: number | null): number | null {
  if (agora === null || antes === null || !antes) return null
  return (agora - antes) / antes
}

export interface DiaDoRitmo {
  dia: string
  rotulo: string
  porPlataforma: Record<Plataforma, number>
  marcaram: number
}

/** Contatos por dia e plataforma; o dia em que alguem que chegou marcou ganha marca. */
export function serieDiaria(lista: Contato[], j: Janela): DiaDoRitmo[] {
  const dias: DiaDoRitmo[] = []
  const porDia = new Map<string, DiaDoRitmo>()
  for (let t = j.inicio; t < j.fim; t += DIA) {
    const d = new Date(t + 12 * 3600 * 1000)
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (porDia.has(dia)) continue
    const item: DiaDoRitmo = {
      dia,
      rotulo: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      porPlataforma: { meta: 0, google: 0, organico: 0 },
      marcaram: 0,
    }
    porDia.set(dia, item)
    dias.push(item)
  }
  const chave = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  for (const c of lista) {
    const item = porDia.get(chave(c.chegouEm))
    if (!item) continue
    item.porPlataforma[c.plataforma]++
    if (marcou(c)) item.marcaram++
  }
  return dias
}

export interface LinhaDeAnuncio {
  chave: string
  id: string | null
  titulo: string
  contatos: number
  marcaram: number
  vieram: number
  gasto: number
}

/**
 * Uma linha por anuncio da Meta: quem ele trouxe e quanto gastou no periodo.
 * Anuncio que gastou e nao trouxe ninguem aparece tambem - e o que mais
 * interessa cortar. Conversa sem codigo (chegou pela frase pronta, ou antes de
 * 07/11 sem o referral guardado) fica numa linha propria, sem gasto.
 */
export function porAnuncio(lista: Contato[], meta: GastoMetaSalvo | null | undefined, j: Janela): LinhaDeAnuncio[] {
  const linhas = new Map<string, LinhaDeAnuncio>()
  const linha = (chave: string, id: string | null, titulo: string) => {
    let l = linhas.get(chave)
    if (!l) {
      l = { chave, id, titulo, contatos: 0, marcaram: 0, vieram: 0, gasto: 0 }
      linhas.set(chave, l)
    }
    return l
  }
  for (const c of lista) {
    if (c.plataforma !== 'meta') continue
    const id = c.anuncioId
    const l = id
      ? linha(id, id, c.tituloDoAnuncio || meta?.anuncios?.[id]?.nome || `Anúncio ${id}`)
      : linha('sem-codigo', null, 'Sem o código do anúncio')
    if (id && l.titulo.startsWith('Anúncio ') && c.tituloDoAnuncio) l.titulo = c.tituloDoAnuncio
    l.contatos++
    if (marcou(c)) l.marcaram++
    if (c.veio) l.vieram++
  }
  for (const [id, anuncio] of Object.entries(meta?.anuncios ?? {})) {
    const gasto = gastoDoAnuncioNaJanela(meta, id, j)
    if (!gasto) continue
    linha(id, id, anuncio.nome || `Anúncio ${id}`).gasto = gasto
  }
  return [...linhas.values()].sort((a, b) => b.marcaram - a.marcaram || b.contatos - a.contatos || b.gasto - a.gasto)
}

export type Tom = 'ok' | 'aviso' | 'erro'

/**
 * Como esta o token da Meta, em uma frase para a tela. O token de 60 dias
 * pode nao andar o vencimento quando renovado (ver
 * supabase/functions/_shared/gastos-meta.ts); por isso o aviso comeca 10 dias
 * antes, com tempo de gerar outro.
 */
export function situacaoDoToken(g: GastosDaCampanha | null, agora: number): { tom: Tom; texto: string } {
  if (!g?.metaConta) return { tom: 'aviso', texto: 'Conta de anúncios da Meta não conectada: o investimento da Meta fica em zero.' }
  if (!g.metaTokenExpiraEm) {
    return g.metaErro ? { tom: 'erro', texto: `Gasto da Meta parado: ${g.metaErro}` } : { tom: 'aviso', texto: 'Conta da Meta sem token: conecte de novo.' }
  }
  const dias = Math.floor((Date.parse(g.metaTokenExpiraEm) - agora) / DIA)
  const data = new Date(g.metaTokenExpiraEm).toLocaleDateString('pt-BR')
  if (dias < 0) return { tom: 'erro', texto: `O token da Meta venceu em ${data}. Gere outro no Facebook e cole em Gasto do Meta.` }
  if (g.metaErro) return { tom: 'erro', texto: g.metaErro }
  if (dias <= 10) return { tom: 'aviso', texto: `O token da Meta vence em ${dias} dia${dias === 1 ? '' : 's'} (${data}). Gere outro no Facebook antes disso.` }
  return { tom: 'ok', texto: `Gasto da Meta automático. Token vence em ${data}; a Central tenta renovar toda semana.` }
}

/** O script do Google roda de hora em hora: sem noticia por mais que isso, avisa; por mais de um dia, grita. */
export const GOOGLE_AVISO_HORAS = 3
export const GOOGLE_ERRO_HORAS = 26

/**
 * Como esta o gasto automatico do Google, em uma frase para a tela
 * (05/11/2026). Nulo quando o script nunca foi ligado: ai vale o lancado a mao,
 * e o aviso de "mes sem lancamento" continua sendo o da tela.
 *
 * O script roda do lado do Google: se ele parar (desligado, sem autorizacao,
 * conta trocada), nada chega e nada da erro aqui. Por isso o atraso e o aviso -
 * o lembrete da vespera ja ficou tres semanas parado sem ninguem ver.
 */
export function situacaoDoGoogle(g: GastosDaCampanha | null, agora: number): { tom: Tom; texto: string } | null {
  if (!g?.googleChaveCriadaEm && !g?.googleAutoEm) return null
  const ultima = g.googleAutoEm ? Date.parse(g.googleAutoEm) : null
  const erroDepois = g.googleErro && (!ultima || !g.googleErroEm || Date.parse(g.googleErroEm) >= ultima)
  if (erroDepois) return { tom: 'erro', texto: `Gasto do Google parado: ${g.googleErro}` }
  if (!g.googleChaveCriadaEm) {
    return { tom: 'aviso', texto: 'O script do Google foi desligado na Central: os números já recebidos ficam, e os dias novos não chegam.' }
  }
  if (ultima === null) {
    return { tom: 'aviso', texto: 'Script gerado, mas o Google Ads ainda não mandou nada. Cole o script na conta, autorize e programe de hora em hora.' }
  }
  const horas = (agora - ultima) / 3600000
  const quando = new Date(ultima).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (horas >= GOOGLE_ERRO_HORAS) {
    return { tom: 'erro', texto: `O Google Ads não manda o gasto desde ${quando}. Confira em Ferramentas > Scripts se o script está programado e sem erro.` }
  }
  if (horas >= GOOGLE_AVISO_HORAS) return { tom: 'aviso', texto: `Último gasto do Google recebido em ${quando}; o script roda de hora em hora.` }
  return { tom: 'ok', texto: `Gasto do Google automático${g.googleConta ? ` (conta ${g.googleConta})` : ''}. Última atualização ${quando}.` }
}

/**
 * Alertas da conta da Meta para a aba (07/11/2026): conta parada (cobranca
 * recusada, conta desativada) e limite de gasto da conta acabando. A mesma
 * leitura avisa no celular da equipe quando o problema aparece.
 */
export function alertasDaConta(s: SituacaoDaContaMeta | null | undefined): { tom: 'aviso' | 'erro'; texto: string }[] {
  if (!s) return []
  const lista: { tom: 'aviso' | 'erro'; texto: string }[] = []
  if (s.problema) lista.push({ tom: 'erro', texto: s.problema })
  if (s.limiteDias !== null && s.limiteDias !== undefined) {
    const restante = (s.limiteRestante ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    lista.push(
      s.limiteDias <= 0
        ? { tom: 'erro', texto: 'O limite de gasto da conta da Meta acabou: os anúncios param até alguém aumentar o limite no Gerenciador.' }
        : {
            tom: 'aviso',
            texto: `O limite de gasto da conta da Meta está acabando: restam ${restante}, cerca de ${Math.max(1, Math.round(s.limiteDias))} dia${Math.round(s.limiteDias) > 1 ? 's' : ''} no ritmo atual.`,
          },
    )
  }
  return lista
}
