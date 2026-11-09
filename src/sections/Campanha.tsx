import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CalendarCheck2,
  CircleDollarSign,
  Flame,
  Instagram,
  Megaphone,
  RefreshCw,
  Search,
  Target,
  UserCheck,
  UsersRound,
  Wallet,
} from 'lucide-react'
import {
  atualizarGastoMeta,
  conectarGastoMeta,
  contatosDaCampanha,
  desconectarGastoMeta,
  desligarScriptDoGoogle,
  gerarScriptDoGoogle,
  getCurrentMembership,
  salvarGastoGoogle,
  type DadosDaCampanha,
  type OrigemDoAnuncio,
} from '@/lib/repository'
import {
  alertasDaConta,
  chaveDoMes,
  divisao,
  gastoGoogleNaJanela,
  investimento,
  janelaAnterior,
  janelaDoMes,
  janelaDosUltimos,
  marcou,
  naJanela,
  numeros,
  PLATAFORMAS,
  plataformasDoFiltro,
  porAnuncio,
  serieDiaria,
  situacaoDoGoogle,
  situacaoDoToken,
  variacao,
  type Contato,
  type Filtro,
  type GastosDaCampanha,
  type Janela,
  type Numeros,
  type Plataforma,
} from '@/lib/campanha'

// Tema da Central da Dra. (verde); o Google ganha um azul proprio para nao
// se confundir com o organico no grafico.
const NAVY = '#193d36'
const ROSA = '#c13584'
const AZUL = '#2f7f74'
const GOOGLE = '#3b6fa8'
const SAGE = '#6f9d91'

const COR: Record<Plataforma, string> = { meta: ROSA, google: GOOGLE, organico: SAGE }
const NOME: Record<Plataforma, string> = { meta: 'Meta (Instagram)', google: 'Google', organico: 'Orgânico' }

type Icone = typeof Instagram
type Periodo = '7' | '30' | '90' | `m:${string}`

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dinheiroOu = (v: number | null, vazio = '—') => (v === null ? vazio : dinheiro(v))
const pct = (v: number) => `${Math.round(v * 100)}%`
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')

function ultimosMeses(agora: number): { chave: string; nome: string }[] {
  const lista = []
  const d = new Date(agora)
  for (let i = 0; i < 6; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const nome = m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    lista.push({ chave: chaveDoMes(m.getTime()), nome: nome.charAt(0).toUpperCase() + nome.slice(1) })
  }
  return lista
}

function Delta({ v, menorEMelhor = false }: { v: number | null; menorEMelhor?: boolean }) {
  if (v === null || !Number.isFinite(v)) return <span className="text-[10px] text-slate-400">sem base para comparar</span>
  const bom = menorEMelhor ? v < 0 : v > 0
  const cor = Math.abs(v) < 0.005 ? 'text-slate-400' : bom ? 'text-[#2f6b5c]' : 'text-red-600'
  return (
    <span className={`text-[10px] font-extrabold ${cor}`}>
      {v > 0 ? '▲' : v < 0 ? '▼' : '='} {pct(Math.abs(v))} <span className="font-semibold text-slate-400">vs. período anterior</span>
    </span>
  )
}

function Kpi({ icone: I, rotulo, valor, detalhe, delta, destaque = false, cor = NAVY }: { icone: Icone; rotulo: string; valor: ReactNode; detalhe?: ReactNode; delta?: ReactNode; destaque?: boolean; cor?: string }) {
  return (
    <div className={`rounded-[20px] p-4 ${destaque ? 'col-span-2 bg-[#193d36] text-white shadow-[0_18px_40px_rgba(25,61,54,.22)]' : 'surface-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${destaque ? 'text-[#dfc49b]' : 'text-slate-400'}`}>{rotulo}</p>
        <I className="h-4 w-4 shrink-0" style={{ color: destaque ? '#dfc49b' : cor }} />
      </div>
      <p className={`mt-2 text-3xl font-extrabold tracking-[-0.05em] ${destaque ? 'text-white' : ''}`} style={destaque ? undefined : { color: NAVY }}>
        {valor}
      </p>
      {detalhe && <p className={`mt-1 text-[10px] leading-snug ${destaque ? 'text-white/65' : 'text-slate-500'}`}>{detalhe}</p>}
      {delta && <div className={`mt-1.5 ${destaque ? '[&_span]:!text-white/75' : ''}`}>{delta}</div>}
    </div>
  )
}

function Cartao({ titulo, sub, icone: I, children, acao }: { titulo: string; sub?: string; icone: Icone; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="surface-card overflow-hidden rounded-[24px]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8f3ef] text-[#17564d]">
            <I className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold tracking-[-0.02em] text-[#193d36]">{titulo}</p>
            {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
          </div>
        </div>
        {acao}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** "1 pediu", "14 pediram": a tela no ar mostrou "1 pediram" em 09/11/2026. */
function pediram(n: number) {
  return `${n} ${n === 1 ? 'pediu' : 'pediram'}`
}

/** Funil desenhado: largura proporcional a quem chegou em cada etapa. */
function Funil({ n }: { n: Numeros }) {
  const etapas: [string, number, string][] = [
    ['Chegaram', n.contatos, n.doDirect ? `${n.contatos - n.doDirect} no WhatsApp · ${n.doDirect} no Direct` : 'escreveram no robô'],
    ['Responderam o robô', n.responderam, 'passaram do primeiro "oi"'],
    ['Marcaram consulta', n.marcaram, 'depois de chegar, sem cancelar'],
    ['Vieram à consulta', n.vieram, 'presença marcada na agenda'],
  ]
  const topo = Math.max(1, n.contatos)
  return (
    <ol className="space-y-2.5">
      {etapas.map(([nome, valor, ajuda], i) => {
        const anterior = i ? etapas[i - 1][1] : null
        const largura = Math.max(4, (valor / topo) * 100)
        return (
          <li key={nome} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[170px_minmax(0,1fr)_110px]">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-extrabold text-[#193d36]">{nome}</p>
              <p className="truncate text-[10px] text-slate-400">{ajuda}</p>
            </div>
            <div className="order-3 col-span-2 h-7 overflow-hidden rounded-lg bg-[#eef6f3] sm:order-none sm:col-span-1" title={`${nome}: ${valor}`}>
              <div className="flex h-full items-center rounded-lg bg-gradient-to-r from-[#193d36] to-[#2f7f74] px-2.5 text-[11px] font-extrabold text-white" style={{ width: `${largura}%` }}>
                {largura > 12 ? valor : ''}
              </div>
            </div>
            <p className="text-right text-[12px] font-extrabold text-[#193d36]">
              {valor}
              <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{anterior === null ? '' : anterior ? `${pct(valor / anterior)} da etapa` : '—'}</span>
            </p>
          </li>
        )
      })}
      {/* Sem isto, a Meta pareceria nao converter nada: quem vem pelo Direct
          marca por telefone ou WhatsApp, e essa consulta nao se liga a conversa. */}
      {n.doDirect > 0 && (
        <li className="rounded-xl bg-[#fdf2f8] px-3 py-2 text-[10px] leading-relaxed text-[#9d174d]">
          <b>Do Direct, {pediram(n.pediramNoDirect)} para agendar.</b> A consulta de quem veio pelo Direct não entra em "Marcaram": a conversa do Instagram não tem
          telefone nem cadastro para ligar à agenda.
        </li>
      )}
    </ol>
  )
}

/** Barras empilhadas por dia: as plataformas somam o total do dia. */
function Ritmo({ lista, janela, plataformas }: { lista: Contato[]; janela: Janela; plataformas: Plataforma[] }) {
  const dias = useMemo(() => serieDiaria(lista, janela), [lista, janela])
  const soma = (d: (typeof dias)[number]) => plataformas.reduce((s, p) => s + d.porPlataforma[p], 0)
  const maior = Math.max(1, ...dias.map(soma))
  const total = dias.reduce((s, d) => s + soma(d), 0)
  if (!total) return <p className="text-[11px] text-slate-400">Nenhum contato neste período.</p>
  const W = 760
  const H = 190
  const base = H - 22
  const passo = W / Math.max(1, dias.length)
  const barra = Math.max(2, passo - 2)
  const cadaRotulo = Math.ceil(dias.length / 10)
  const marcas = [...new Set([0, Math.round(maior / 2), maior])]
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-bold text-slate-600">
        {plataformas.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR[p] }} />
            {NOME[p]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#193d36] bg-white" />
          Alguém que chegou no dia marcou consulta
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Contatos por dia e plataforma">
        {marcas.map((m) => (
          <g key={m}>
            <line x1={0} x2={W} y1={base - (m / maior) * (base - 14)} y2={base - (m / maior) * (base - 14)} stroke={NAVY} strokeOpacity={0.07} />
            <text x={2} y={base - (m / maior) * (base - 14) - 3} fontSize={10} fill="#94a3b8">
              {m}
            </text>
          </g>
        ))}
        {dias.map((d, i) => {
          let y = base
          const x = i * passo + 1
          const n = soma(d)
          return (
            <g key={d.dia}>
              <title>{`${d.rotulo}: ${n} contato${n === 1 ? '' : 's'}${plataformas.filter((p) => d.porPlataforma[p]).map((p) => ` · ${NOME[p]} ${d.porPlataforma[p]}`).join('')}${d.marcaram ? ` · ${d.marcaram} marcou` : ''}`}</title>
              <rect x={x} y={0} width={barra} height={base} fill="transparent" />
              {plataformas.map((p) => {
                const h = (d.porPlataforma[p] / maior) * (base - 14)
                if (!h) return null
                y -= h
                return <rect key={p} x={x} y={y + 1} width={barra} height={Math.max(0, h - 1)} rx={Math.min(3, barra / 2)} fill={COR[p]} />
              })}
              {d.marcaram > 0 && <circle cx={x + barra / 2} cy={y - 7} r={4} fill="#fff" stroke={NAVY} strokeWidth={2} />}
              {i % cadaRotulo === 0 && (
                <text x={x + barra / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="#94a3b8">
                  {d.rotulo}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Barrinha({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(3, (valor / max) * 100) : 0}%`, background: cor }} />
    </span>
  )
}

function Situacao({ c }: { c: Contato }) {
  if (c.canal === 'direct') {
    return c.pediuAgendar ? (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold text-amber-800">Pediu para agendar</span>
    ) : (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold text-slate-500">Conversa no Direct</span>
    )
  }
  if (c.veio) return <span className="rounded-full bg-[#e8f3ef] px-2 py-0.5 text-[9px] font-extrabold text-[#2f6b5c]">Veio à consulta</span>
  if (c.consultaEm && !c.consultaCancelada) {
    return <span className="rounded-full bg-[#e8f3ef] px-2 py-0.5 text-[9px] font-extrabold text-[#2f6b5c]">Marcou para {quando(c.consultaEm)}</span>
  }
  if (c.consultaCancelada) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-extrabold text-red-700">Marcou e cancelou</span>
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold text-slate-500">Sem consulta ainda</span>
}

/**
 * Quanto cada conta vai cobrar no cartao e se ela esta rodando (07/11/2026).
 *
 * Pedido do Edu: "trazer o saldo que ta na campanha do Meta disponivel e que
 * avise quando estiver acabando, e tambem o saldo do Google Ads". As duas
 * contas da Dra. sao pos-pagas no cartao: nao ha credito para acabar. O que
 * aparece aqui e o valor que vai ser cobrado e, na Meta, se a conta parou
 * (cobranca recusada) ou se o limite de gasto da conta esta no fim.
 *
 * O Google nao deixa o script ler o saldo da conta; o gasto do mes e o que o
 * Google cobra no cartao (no dia 1 ou ao chegar no limite de cobranca), entao
 * e ele que aparece.
 */
function ContasDeAnuncio({ gastos, agora }: { gastos: GastosDaCampanha; agora: number }) {
  const s = gastos.metaSituacao
  const mes = janelaDoMes(chaveDoMes(agora))
  const googleDoMes = gastoGoogleNaJanela(gastos.google, mes, agora, gastos.googleAuto)
  const google = situacaoDoGoogle(gastos, agora)
  const nomeDoMes = new Date(agora).toLocaleDateString('pt-BR', { month: 'long' })
  const selo = (tom: 'ok' | 'aviso' | 'erro', texto: string) => (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
        tom === 'ok' ? 'bg-[#e8f3ef] text-[#2f6b5c]' : tom === 'aviso' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'
      }`}
    >
      {texto}
    </span>
  )
  return (
    <Cartao titulo="Contas de anúncio" sub="O que cada conta vai cobrar no cartão, e se ela está rodando." icone={CircleDollarSign}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[12px] font-extrabold text-[#193d36]">
              <span className="h-3 w-3 rounded-full" style={{ background: COR.meta }} />
              {NOME.meta}
            </p>
            {s ? (s.problema ? selo('erro', 'Anúncios parados') : s.limiteDias !== null ? selo('aviso', 'Limite acabando') : selo('ok', 'Conta ativa')) : null}
          </div>
          {s ? (
            <>
              <p className="mt-3 text-3xl font-extrabold tracking-[-0.05em] text-[#193d36]">{dinheiroOu(s.aPagar)}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">a pagar na próxima cobrança</p>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                A Meta cobra sozinha no cartão cadastrado, sem o imposto, que vem à parte.
                {s.limite ? ` Limite de gasto da conta: ${dinheiro(s.limite)}; restam ${dinheiroOu(s.limiteRestante)}.` : ' A conta não tem limite de gasto.'}
                {` Lido em ${quando(s.lidoEm)}.`}
              </p>
              {s.problema && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{s.problema}</p>}
            </>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">
              Aparece depois da primeira busca com a conta da Meta conectada, em Gasto das campanhas, no fim desta página.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[12px] font-extrabold text-[#193d36]">
              <span className="h-3 w-3 rounded-full" style={{ background: COR.google }} />
              {NOME.google}
            </p>
            {google ? selo(google.tom, google.tom === 'ok' ? 'Script em dia' : google.tom === 'aviso' ? 'Atrasado' : 'Parado') : selo('aviso', 'Lançado à mão')}
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-[-0.05em] text-[#193d36]">{dinheiro(googleDoMes)}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">gasto de {nomeDoMes} até agora</p>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            É o que o Google cobra no cartão cadastrado, no começo do mês seguinte ou antes, se chegar no limite de cobrança dele. O Google não deixa ler
            o saldo da conta por fora; {gastos.googleAuto ? 'o gasto chega sozinho pelo script da conta.' : 'sem o script, vale o valor lançado à mão.'}
          </p>
        </div>
      </div>
    </Cartao>
  )
}

/**
 * Onde o dono liga a conta da Meta e lanca o Google (07/11/2026). O token e
 * colado aqui pelo proprio Edu (ele gera no Facebook e cola; a Central nunca
 * mostra o token de volta).
 */
function PainelDoGasto({ clinicId, gastos, agora, aoMudar }: { clinicId: string; gastos: GastosDaCampanha; agora: number; aoMudar: () => void }) {
  const [token, setToken] = useState('')
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([])
  const [conta, setConta] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [mensagem, setMensagem] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const meses = useMemo(() => ultimosMeses(agora).slice(0, 3), [agora])
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(meses.map((m) => [m.chave, gastos.google[m.chave] ? gastos.google[m.chave].toFixed(2).replace('.', ',') : ''])),
  )
  const situacao = situacaoDoToken(gastos, agora)
  const situacaoGoogle = situacaoDoGoogle(gastos, agora)
  // O script so aparece logo depois de gerado: a chave vai nele e a Central nao guarda o texto.
  const [script, setScript] = useState('')
  const [trocarScript, setTrocarScript] = useState(false)

  const agir = async (nome: string, fn: () => Promise<string>) => {
    setOcupado(nome)
    setMensagem(null)
    try {
      setMensagem({ tom: 'ok', texto: await fn() })
      aoMudar()
    } catch (causa) {
      const falha = causa as Error & { code?: string; contas?: { id: string; nome: string }[] }
      if (falha.code === 'ESCOLHER_CONTA' && falha.contas?.length) {
        setContas(falha.contas)
        setConta(falha.contas[0].id)
      }
      setMensagem({ tom: 'erro', texto: falha.message || 'Não deu certo.' })
    } finally {
      setOcupado('')
    }
  }

  return (
    <Cartao titulo="Gasto das campanhas" sub="Só o responsável pela clínica vê e mexe aqui." icone={Wallet}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Meta (automático)</p>
          <p
            className={`rounded-xl border px-3 py-2 text-[11px] ${
              situacao.tom === 'ok' ? 'border-[#cfe5dc] bg-[#f1f8f5] text-[#2f6b5c]' : situacao.tom === 'aviso' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {situacao.texto}
          </p>
          {gastos.metaConta && (
            <p className="text-[10px] text-slate-500">
              Conta {gastos.metaContaNome ? `"${gastos.metaContaNome}" ` : ''}({gastos.metaConta})
              {gastos.metaTokenDe ? `, token de ${gastos.metaTokenDe}` : ''}
              {gastos.metaAtualizadoEm ? `. Última busca ${quando(gastos.metaAtualizadoEm)}.` : '.'}
            </p>
          )}
          <label className="block text-[10px] font-bold text-slate-500">
            {gastos.metaConta ? 'Trocar o token' : 'Token da Meta (ads_read)'}
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cole aqui o token gerado no Facebook"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-[#2f7f74]"
            />
          </label>
          {contas.length > 0 && (
            <label className="block text-[10px] font-bold text-slate-500">
              Qual conta de anúncios ler
              <select value={conta} onChange={(e) => setConta(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px]">
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome || 'Sem nome'} ({c.id})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!token.trim() || Boolean(ocupado)}
              onClick={() =>
                agir('conectar', async () => {
                  const r = await conectarGastoMeta(clinicId, token.trim(), contas.length ? conta : undefined)
                  setToken('')
                  setContas([])
                  return r.aviso ?? `Conectado${r.expiraEm ? `: o token vence em ${new Date(r.expiraEm).toLocaleDateString('pt-BR')}` : ''}.`
                })
              }
              className="rounded-xl bg-[#193d36] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-40"
            >
              {ocupado === 'conectar' ? 'Conferindo...' : 'Conectar'}
            </button>
            {gastos.metaConta && (
              <button
                type="button"
                disabled={Boolean(ocupado)}
                onClick={() => agir('atualizar', async () => (await atualizarGastoMeta(clinicId), 'Gasto da Meta atualizado.'))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-extrabold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${ocupado === 'atualizar' ? 'animate-spin' : ''}`} /> Atualizar agora
              </button>
            )}
            {gastos.metaTokenExpiraEm && (
              <button
                type="button"
                disabled={Boolean(ocupado)}
                onClick={() => agir('desconectar', async () => (await desconectarGastoMeta(clinicId), 'Desconectado. Os números já buscados ficam.'))}
                className="rounded-xl px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-red-600 disabled:opacity-40"
              >
                Desconectar
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
            Google {gastos.googleChaveCriadaEm ? '(automático)' : '(lançado à mão)'}
          </p>
          {situacaoGoogle ? (
            <p
              className={`rounded-xl border px-3 py-2 text-[11px] ${
                situacaoGoogle.tom === 'ok'
                  ? 'border-[#cfe5dc] bg-[#f1f8f5] text-[#2f6b5c]'
                  : situacaoGoogle.tom === 'aviso'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {situacaoGoogle.texto}
            </p>
          ) : (
            <p className="text-[10px] leading-relaxed text-slate-500">
              Para o gasto do Google entrar sozinho, de hora em hora, gere o script abaixo e cole na conta do Google Ads. Ele só lê o custo; não mexe em
              nada da campanha.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(ocupado)}
              onClick={() => {
                // Gerar outro desliga o script que ja esta na conta: pede um segundo clique
                if (gastos.googleChaveCriadaEm && !trocarScript) {
                  setTrocarScript(true)
                  setMensagem({ tom: 'erro', texto: 'Gerar outro script desliga o que está no Google Ads hoje. Clique de novo para confirmar.' })
                  return
                }
                void agir('google-script', async () => {
                  setScript(await gerarScriptDoGoogle(clinicId))
                  setTrocarScript(false)
                  return 'Script gerado: siga os passos e cole no Google Ads.'
                })
              }}
              className="rounded-xl bg-[#193d36] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-40"
            >
              {ocupado === 'google-script' ? 'Gerando...' : gastos.googleChaveCriadaEm ? (trocarScript ? 'Confirmar: gerar outro' : 'Gerar outro script') : 'Ligar o automático'}
            </button>
            {gastos.googleChaveCriadaEm && (
              <button
                type="button"
                disabled={Boolean(ocupado)}
                onClick={() =>
                  agir('google-desligar', async () => {
                    await desligarScriptDoGoogle(clinicId)
                    setScript('')
                    return 'Script desligado. Os números já recebidos ficam; apague também o script no Google Ads.'
                  })
                }
                className="rounded-xl px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-red-600 disabled:opacity-40"
              >
                Desligar
              </button>
            )}
          </div>
          {script && (
            <div className="space-y-2 rounded-xl border border-[#d7e6e1] bg-[#f6faf8] p-3">
              <ol className="list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-slate-600">
                <li>No Google Ads da clínica, abra Ferramentas, Ações em massa, Scripts, e clique em +.</li>
                <li>Apague o que vier escrito, cole o script e dê o nome Central de Cuidado.</li>
                <li>Clique em Autorizar e entre com a conta que administra o Google Ads.</li>
                <li>Clique em Visualizar para testar, depois em Salvar, e em Frequência escolha De hora em hora.</li>
              </ol>
              <textarea
                readOnly
                value={script}
                onFocus={(e) => e.currentTarget.select()}
                className="h-32 w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-[10px] text-slate-600"
              />
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(script)
                    .then(() => setMensagem({ tom: 'ok', texto: 'Script copiado. Cole no Google Ads.' }))
                    .catch(() => setMensagem({ tom: 'erro', texto: 'Não consegui copiar: selecione o texto e copie com Ctrl+C.' }))
                }
                className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-extrabold text-slate-600 hover:bg-slate-200"
              >
                Copiar o script
              </button>
              <p className="text-[10px] leading-relaxed text-slate-500">
                O script leva uma chave que só vale para esta clínica: não mande por WhatsApp nem por e-mail. Ele some desta tela quando você sair dela.
              </p>
            </div>
          )}
          <p className="pt-1 text-[10px] font-bold text-slate-500">Lançado à mão</p>
          <p className="text-[10px] leading-relaxed text-slate-500">
            {gastos.googleAuto
              ? 'Com o automático, o valor lançado só conta para os dias antes do primeiro dia que o script lê.'
              : 'O valor de cada mês está no Google Ads, em Campanhas, coluna Custo. No mês corrente, lance o gasto até hoje e atualize de vez em quando.'}
            {gastos.googleAtualizadoEm ? ` Último lançamento ${quando(gastos.googleAtualizadoEm)}.` : ''}
          </p>
          <div className="space-y-2">
            {meses.map((m) => (
              <div key={m.chave} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-[11px] font-bold text-[#193d36]">{m.nome}</span>
                <span className="text-[11px] text-slate-400">R$</span>
                <input
                  inputMode="decimal"
                  value={valores[m.chave] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [m.chave]: e.target.value }))}
                  placeholder="0,00"
                  className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-right text-[12px] outline-none focus:border-[#2f7f74]"
                />
                <button
                  type="button"
                  disabled={Boolean(ocupado)}
                  onClick={() =>
                    agir(`google-${m.chave}`, async () => {
                      const bruto = (valores[m.chave] ?? '').trim()
                      const valor = bruto ? Number(bruto.replace(/\./g, '').replace(',', '.')) : 0
                      if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor inválido: use números, como 465,10.')
                      await salvarGastoGoogle(clinicId, m.chave, valor)
                      return `Google de ${m.nome.toLowerCase()} gravado.`
                    })
                  }
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-extrabold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                >
                  {ocupado === `google-${m.chave}` ? '...' : 'Gravar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {mensagem && (
        <p className={`mt-4 rounded-xl px-3 py-2 text-[11px] font-semibold ${mensagem.tom === 'ok' ? 'bg-[#f1f8f5] text-[#2f6b5c]' : 'bg-red-50 text-red-700'}`}>{mensagem.texto}</p>
      )}
    </Cartao>
  )
}

export default function Campanha() {
  const [agora] = useState(() => Date.now())
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const [filtro, setFiltro] = useState<Filtro>('pago')
  const [dados, setDados] = useState<DadosDaCampanha | null>(null)
  const [clinica, setClinica] = useState<{ id: string; dono: boolean } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  const meses = useMemo(() => ultimosMeses(agora), [agora])

  const janela = useMemo<Janela>(() => (periodo.startsWith('m:') ? janelaDoMes(periodo.slice(2)) : janelaDosUltimos(Number(periodo), agora)), [periodo, agora])
  const anterior = useMemo(() => janelaAnterior(janela), [janela])
  const plataformas = useMemo(() => plataformasDoFiltro(filtro), [filtro])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro('')
    void (async () => {
      try {
        const membership = await getCurrentMembership()
        if (!membership) throw new Error('Não identifiquei a clínica do seu usuário.')
        // Um pedido so para o periodo e o anterior: a comparacao sai do mesmo lote.
        const r = await contatosDaCampanha(membership.clinicId, new Date(anterior.inicio), new Date(janela.fim))
        if (!vivo) return
        setClinica({ id: membership.clinicId, dono: membership.role === 'owner' })
        setDados(r)
      } catch (causa) {
        if (vivo) setErro(causa instanceof Error ? causa.message : 'Não consegui carregar a campanha.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [janela, anterior, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  const gastos = dados?.gastos ?? null
  const todos = useMemo(() => naJanela(dados?.contatos ?? [], janela), [dados, janela])
  // A mais recente em cima, seja qual for a ordem em que o banco devolveu.
  const lista = useMemo(
    () => todos.filter((c) => plataformas.includes(c.plataforma)).sort((a, b) => Date.parse(b.chegouEm) - Date.parse(a.chegouEm)),
    [todos, plataformas],
  )
  const listaAntes = useMemo(() => naJanela(dados?.contatos ?? [], anterior).filter((c) => plataformas.includes(c.plataforma)), [dados, anterior, plataformas])
  const n = useMemo(() => numeros(lista), [lista])
  const nAntes = useMemo(() => numeros(listaAntes), [listaAntes])
  const gasto = useMemo(() => investimento(gastos, janela, plataformas, agora), [gastos, janela, plataformas, agora])
  const gastoAntes = useMemo(() => investimento(gastos, anterior, plataformas, agora), [gastos, anterior, plataformas, agora])
  const porContato = divisao(gasto, n.contatos)
  const porConsulta = divisao(gasto, n.marcaram)
  const porConsultaAntes = divisao(gastoAntes, nAntes.marcaram)
  const porQuemVeio = divisao(gasto, n.vieram)

  const linhasDePlataforma = useMemo(
    () =>
      PLATAFORMAS.map((p) => {
        const doCanal = todos.filter((c) => c.plataforma === p)
        const num = numeros(doCanal)
        const g = investimento(gastos, janela, [p], agora)
        return { p, ...num, gasto: g, porContato: divisao(g, num.contatos), porConsulta: divisao(g, num.marcaram) }
      }).filter((l) => l.contatos || l.gasto),
    [todos, gastos, janela, agora],
  )
  // Sempre de todos os contatos da Meta: no filtro Organico, o anuncio que
  // trouxe gente nao pode virar alerta de "gastou e nao trouxe ninguem".
  const anuncios = useMemo(() => porAnuncio(todos, gastos?.meta, janela), [todos, gastos, janela])

  const alertas = useMemo(() => {
    const a: { tom: 'erro' | 'aviso'; texto: string }[] = []
    if (gastos) {
      // Primeiro o que ja parou os anuncios (cartao recusado, limite da conta)
      a.push(...alertasDaConta(gastos.metaSituacao))
      const token = situacaoDoToken(gastos, agora)
      if (token.tom !== 'ok') a.push({ tom: token.tom, texto: token.texto })
      const google = situacaoDoGoogle(gastos, agora)
      if (google && google.tom !== 'ok') a.push({ tom: google.tom, texto: google.texto })
      const mesAtual = chaveDoMes(agora)
      if (!google && !gastos.google[mesAtual]) a.push({ tom: 'aviso', texto: 'O gasto do Google deste mês ainda não foi lançado: sem ele o custo do Google fica em zero.' })
    }
    const ultimoMeta = (dados?.contatos ?? []).filter((c) => c.plataforma === 'meta').reduce((m, c) => Math.max(m, Date.parse(c.chegouEm)), 0)
    const diasSemMeta = ultimoMeta ? Math.floor((agora - ultimoMeta) / 86400000) : null
    if (diasSemMeta !== null && diasSemMeta >= 3) a.push({ tom: 'erro', texto: `Meta: ${diasSemMeta} dias sem nenhuma família nova pelo anúncio. Confira se a campanha está ligada e com saldo.` })
    for (const l of anuncios) if (l.gasto >= 100 && !l.contatos) a.push({ tom: 'aviso', texto: `Anúncio "${l.titulo}": ${dinheiro(l.gasto)} no período e ninguém no WhatsApp nem no Direct.` })
    return a
  }, [gastos, dados, anuncios, agora])

  const maiorPlataforma = Math.max(1, ...linhasDePlataforma.map((l) => l.contatos))
  const semDinheiro = !gastos

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['7', '7 dias'],
              ['30', '30 dias'],
              ['90', '90 dias'],
            ] as [Periodo, string][]
          ).map(([k, nome]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriodo(k)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-extrabold transition ${periodo === k ? 'bg-[#193d36] text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {nome}
            </button>
          ))}
        </div>
        <select
          value={periodo.startsWith('m:') ? periodo : ''}
          onChange={(e) => e.target.value && setPeriodo(e.target.value as Periodo)}
          aria-label="Escolher um mês"
          className={`rounded-xl px-3 py-2 text-[10px] font-extrabold outline-none ${periodo.startsWith('m:') ? 'bg-[#193d36] text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          <option value="">Mês fechado</option>
          {meses.map((m) => (
            <option key={m.chave} value={`m:${m.chave}`}>
              {m.nome}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {(['pago', 'meta', 'google', 'organico', 'todos'] as Filtro[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-extrabold transition ${filtro === k ? 'bg-white text-[#193d36] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {k !== 'pago' && k !== 'todos' && <span className="h-2 w-2 rounded-full" style={{ background: COR[k] }} />}
              {k === 'pago' ? 'Tráfego pago' : k === 'todos' ? 'Tudo' : NOME[k]}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-[16px] border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {carregando && !dados ? (
        <div className="surface-card rounded-[24px] p-10 text-center text-xs text-slate-500">Contando...</div>
      ) : dados && !dados.disponivel ? (
        // Zero aqui pareceria "ninguem veio do anuncio"; e so o banco atrasado.
        <div className="flex items-start gap-2 rounded-[16px] border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>O banco ainda não tem o registro de origem dos anúncios. Ele chega com a próxima publicação; até lá esta aba fica vazia, e não quer dizer que ninguém veio do anúncio.</span>
        </div>
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              icone={Wallet}
              rotulo="Investimento"
              valor={semDinheiro ? '—' : dinheiro(gasto)}
              detalhe={semDinheiro ? 'só o responsável pela clínica vê' : filtro === 'organico' ? 'orgânico não tem custo' : gastos?.googleAuto ? 'Meta e Google automáticos' : 'Meta automático, Google lançado'}
              delta={!semDinheiro && filtro !== 'organico' && <Delta v={variacao(gasto, gastoAntes)} menorEMelhor />}
              cor={ROSA}
            />
            <Kpi
              icone={UsersRound}
              rotulo="Contatos"
              valor={n.contatos}
              detalhe={n.doDirect ? `${n.contatos - n.doDirect} no WhatsApp · ${n.doDirect} no Direct` : 'pessoas que escreveram no WhatsApp ou no Direct'}
              delta={<Delta v={variacao(n.contatos, nAntes.contatos)} />}
              cor={AZUL}
            />
            <Kpi
              icone={CircleDollarSign}
              rotulo="Custo por contato"
              valor={semDinheiro ? '—' : dinheiroOu(porContato)}
              detalhe="investimento ÷ contatos"
              delta={!semDinheiro && <Delta v={variacao(porContato, divisao(gastoAntes, nAntes.contatos))} menorEMelhor />}
            />
            <Kpi
              icone={CalendarCheck2}
              rotulo="Marcaram consulta"
              valor={n.marcaram}
              detalhe={`${n.contatos ? pct(n.marcaram / n.contatos) : '0%'} dos contatos${n.pediramNoDirect ? ` · ${pediram(n.pediramNoDirect)} no Direct` : ''}`}
              delta={<Delta v={variacao(n.marcaram, nAntes.marcaram)} />}
              cor={SAGE}
            />
            <Kpi icone={UserCheck} rotulo="Vieram à consulta" valor={n.vieram} detalhe={`de ${n.marcaram} que marcaram`} cor={SAGE} />
            <Kpi icone={Target} rotulo="Custo por paciente que veio" valor={semDinheiro ? '—' : dinheiroOu(porQuemVeio, gasto ? 'ninguém veio ainda' : '—')} detalhe="investimento ÷ quem veio à consulta" />
            <Kpi
              icone={Megaphone}
              rotulo="Custo por consulta marcada"
              valor={semDinheiro ? '—' : dinheiroOu(porConsulta, gasto ? 'sem consulta' : '—')}
              detalhe="o número que guia o orçamento"
              delta={!semDinheiro && <Delta v={variacao(porConsulta, porConsultaAntes)} menorEMelhor />}
              destaque
            />
          </div>

          {gastos && <ContasDeAnuncio gastos={gastos} agora={agora} />}

          {dados.avisoDosGastos && (
            <p className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-900">{dados.avisoDosGastos}</p>
          )}

          {alertas.length > 0 && (
            <section className="surface-card rounded-[24px] p-5">
              <p className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas da campanha
              </p>
              <ul className="grid gap-2 lg:grid-cols-2">
                {alertas.map((a, i) => (
                  <li key={i} className={`rounded-xl border px-3.5 py-2.5 text-[11px] ${a.tom === 'erro' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                    {a.texto}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <Cartao titulo="Funil do anúncio à consulta" sub="Quantos passaram de cada etapa, e a porcentagem em relação à etapa anterior." icone={Target}>
              <Funil n={n} />
            </Cartao>
            <Cartao titulo="Ritmo diário" sub="Contatos por dia, por plataforma (passe o mouse para ver o dia)." icone={Megaphone}>
              <Ritmo lista={lista} janela={janela} plataformas={plataformas} />
            </Cartao>
          </div>

          <Cartao
            titulo="Plataformas"
            sub={`Pago e orgânico lado a lado no período. O gasto da Meta entra sozinho; o do Google ${gastos?.googleAuto ? 'também, pelo script da conta' : 'é lançado à mão, em Gasto das campanhas'}.`}
            icone={Wallet}
          >
            {linhasDePlataforma.length === 0 ? (
              <p className="text-[11px] text-slate-400">Nenhum contato neste período.</p>
            ) : (
              <div className="space-y-3">
                {linhasDePlataforma.map((l) => (
                  <div key={l.p} className="grid gap-x-4 gap-y-2 rounded-2xl border border-slate-100 p-3.5 sm:grid-cols-[170px_minmax(0,1fr)] lg:grid-cols-[170px_minmax(0,1fr)_repeat(5,92px)] lg:items-center">
                    <p className="flex items-center gap-2 text-[12px] font-extrabold text-[#193d36]">
                      <span className="h-3 w-3 rounded-full" style={{ background: COR[l.p] }} />
                      {NOME[l.p]}
                    </p>
                    <Barrinha valor={l.contatos} max={maiorPlataforma} cor={COR[l.p]} />
                    {(
                      [
                        ['Contatos', String(l.contatos)],
                        ['Marcaram', l.contatos ? `${l.marcaram} · ${pct(l.marcaram / l.contatos)}` : '0'],
                        ['Vieram', String(l.vieram)],
                        ['Por contato', semDinheiro || l.p === 'organico' ? '—' : dinheiroOu(l.porContato)],
                        ['Por consulta', semDinheiro || l.p === 'organico' ? '—' : l.gasto ? dinheiroOu(l.porConsulta, 'sem consulta') : '—'],
                      ] as [string, string][]
                    ).map(([rotulo, v]) => (
                      <p key={rotulo} className="flex justify-between gap-2 text-[12px] lg:block lg:text-right">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400 lg:block">{rotulo}</span>
                        <b className="text-[#193d36]">{v}</b>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Cartao>

          {plataformas.includes('meta') && (
            <Cartao titulo="Anúncios da Meta" sub="Cada família que toca no anúncio traz o código dele. Ordenado por consultas marcadas." icone={Flame}>
              {anuncios.length === 0 ? (
                <p className="text-[11px] text-slate-400">Nenhum contato nem gasto da Meta neste período.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {anuncios.map((l, i) => (
                    <li key={l.chave} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(5,84px)] sm:items-center">
                      <div className="min-w-0">
                        <p className="text-[12px] font-extrabold text-[#193d36]">
                          {i === 0 && l.marcaram > 0 && (
                            <span className="mr-2 rounded-full bg-[#e8f3ef] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#2f6b5c]">Melhor</span>
                          )}
                          {l.titulo}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {l.id ? `Anúncio ${l.id}` : 'Sem o código: a Meta não informou, ou chegou antes de 07/11'}
                          {l.pediramNoDirect > 0 && <span className="font-bold text-amber-700">{` · ${pediram(l.pediramNoDirect)} para agendar no Direct`}</span>}
                        </p>
                      </div>
                      {(
                        [
                          ['Contatos', String(l.contatos)],
                          ['Marcaram', String(l.marcaram)],
                          ['Vieram', String(l.vieram)],
                          ['Gasto', semDinheiro ? '—' : l.id ? dinheiro(l.gasto) : '—'],
                          ['Por contato', semDinheiro || !l.id ? '—' : dinheiroOu(divisao(l.gasto, l.contatos))],
                        ] as [string, string][]
                      ).map(([rotulo, v]) => (
                        <p key={rotulo} className="flex justify-between text-[12px] sm:block sm:text-right">
                          <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400 sm:block">{rotulo}</span>
                          <b className="text-[#193d36]">{v}</b>
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}

          <Cartao
            titulo="Quem chegou"
            sub="A mais recente em cima. Para abrir a conversa, procure o telefone em Respostas (ou o nome, na aba Instagram)."
            icone={UsersRound}
          >
            {lista.length === 0 ? (
              <p className="text-[11px] text-slate-500">Ninguém chegou por aqui neste período.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lista.map((c) => (
                  <li key={c.conversaId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-extrabold text-[#193d36]">{c.nome}</p>
                      <p className="text-[10px] text-slate-500">
                        {c.canal === 'direct' ? 'Direct do Instagram' : c.telefone} · chegou {quando(c.chegouEm)}
                        {c.tituloDoAnuncio ? ` · anúncio "${c.tituloDoAnuncio}"` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.origem ? <SeloDaOrigem origem={c.origem} /> : <SeloOrganico />}
                      <Situacao c={c} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {clinica?.dono && gastos && <PainelDoGasto clinicId={clinica.id} gastos={gastos} agora={agora} aoMudar={recarregar} />}

          <p className="text-[10px] leading-relaxed text-slate-400">
            Contato conta quem escreveu no WhatsApp ou no Direct do Instagram; quem viu ou clicou e desistiu antes de mandar a mensagem aparece só no
            Gerenciador da Meta e no Google Ads. Do Google, só entra quem mandou a frase pronta "Encontrei a Dra. Patrícia Zerbini no Google" sem
            mudar. Do Direct, entra como Meta quem chegou com o código do anúncio, que a Meta nem sempre manda: parte do orgânico do Direct pode ser
            anúncio. Orgânico é quem escreveu pela primeira vez no período sem vir de anúncio. Marcou conta a consulta feita depois da chegada, na
            conversa do WhatsApp ou no cadastro do paciente; quem veio pelo Direct não tem como ser ligado à agenda e aparece como "pediu para
            agendar". O gasto da Meta é o do Gerenciador, sem o imposto cobrado à parte.
            {lista.some((c) => marcou(c) && !c.veio) ? ' Quem marcou para depois de hoje ainda não pode ter vindo.' : ''}
          </p>
        </>
      ) : null}
    </section>
  )
}

const NOME_DA_ORIGEM: Record<OrigemDoAnuncio, string> = {
  instagram: 'Instagram',
  // A Meta mandou o anuncio sem dizer se foi Instagram ou Facebook.
  meta: 'Anúncio Meta',
  facebook: 'Facebook',
  google: 'Google',
}

/** Selo de origem, o mesmo na aba e no cartao da conversa em Respostas. */
export function SeloDaOrigem({ origem }: { origem: OrigemDoAnuncio }) {
  const google = origem === 'google'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
        google ? 'bg-[#eef5fd] text-[#16456b]' : 'bg-[#fbeaf3] text-[#9b2c6a]'
      }`}
    >
      {google ? <Search className="h-2.5 w-2.5" /> : origem === 'facebook' ? <Megaphone className="h-2.5 w-2.5" /> : <Instagram className="h-2.5 w-2.5" />}
      {google ? 'Google' : NOME_DA_ORIGEM[origem]}
    </span>
  )
}

function SeloOrganico() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#eef6f3] px-2 py-0.5 text-[9px] font-extrabold text-[#2f6b5c]">Orgânico</span>
}
