import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, CalendarCheck2, Instagram, MoonStar } from 'lucide-react'
import { getCurrentMembership, numerosDoInstagram, type NumerosDoInstagram as Numeros } from '@/lib/repository'

const NAVY = '#193d36'
const AZUL = '#2f7f74'
const SAGE = '#6f9d91'
const ROSA = '#c13584'

/**
 * Aba "Instagram" da Visão geral (02/10/2026).
 *
 * O que o robô fez no Direct: quem escreveu, o que perguntou, o que ele
 * resolveu sozinho e o que sobrou para a equipe. Conta a partir de
 * instagram_bot_events, que nasceu nesta data - antes disso o robô não
 * registrava nada, e a tela avisa para número baixo não parecer robô parado.
 *
 * Seguidores, alcance e curtidas não estão aqui: dependem da permissão de
 * insights da Meta, que não foi pedida (o app só lê e responde o Direct).
 */
const EVENTOS_DESDE = new Date(2026, 9, 2)

const NOME_DO_BOTAO: Record<string, string> = {
  VALOR: 'Valores',
  CONVENIO: 'Convênio',
  CASA: 'Consulta em casa',
  ENDERECO: 'Endereço',
  COMO: 'Como é a consulta',
  AGENDAR: 'Agendar',
  EQUIPE: 'Falar com a equipe',
}

const NOME_DO_MOTIVO: Record<string, string> = {
  agendar: 'Pediu para agendar',
  pediu: 'Pediu para falar com a equipe',
  saude: 'Dúvida de saúde (o robô não responde)',
  nao_entendeu: 'O robô não entendeu a pergunta',
}

const PERIODOS = [
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '30 dias', dias: 30 },
  { rotulo: '90 dias', dias: 90 },
]

function porcento(parte: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((parte / total) * 100)}%`
}

function Numero({ rotulo, valor, detalhe, icone: Icone, cor }: {
  rotulo: string
  valor: string | number
  detalhe: string
  icone: typeof Instagram
  cor: string
}) {
  return (
    <div className="surface-card rounded-[20px] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{rotulo}</p>
        <Icone className="h-4 w-4 shrink-0" style={{ color: cor }} />
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-[-0.05em]" style={{ color: NAVY }}>{valor}</p>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{detalhe}</p>
    </div>
  )
}

function Barra({ rotulo, valor, max, cor }: { rotulo: string; valor: number; max: number; cor: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="font-bold text-[#193d36]">{rotulo}</span>
        <span className="font-extrabold tabular-nums text-slate-500">{valor}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max((valor / Math.max(max, 1)) * 100, valor > 0 ? 4 : 0)}%`, background: cor }}
        />
      </div>
    </div>
  )
}

function Bloco({ titulo, subtitulo, vazio, itens, cor }: {
  titulo: string
  subtitulo: string
  vazio: string
  itens: { nome: string; valor: number }[]
  cor: string
}) {
  return (
    <div className="surface-card rounded-[24px] p-5">
      <p className="text-sm font-extrabold tracking-[-0.02em] text-[#193d36]">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>
      <div className="mt-4 space-y-3">
        {itens.length === 0 ? (
          <p className="text-[11px] text-slate-500">{vazio}</p>
        ) : (
          itens.map((item) => <Barra key={item.nome} rotulo={item.nome} valor={item.valor} max={itens[0]?.valor ?? 1} cor={cor} />)
        )}
      </div>
    </div>
  )
}

function ordenar(contagem: Record<string, number>, nomes: Record<string, string> = {}) {
  return Object.entries(contagem)
    .map(([chave, valor]) => ({ nome: nomes[chave] ?? chave, valor }))
    .filter((item) => item.valor > 0)
    .sort((a, b) => b.valor - a.valor)
}

export default function NumerosDoInstagram() {
  const [dias, setDias] = useState(30)
  const [dados, setDados] = useState<Numeros | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const inicio = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - dias)
    return d
  }, [dias])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro('')
    void (async () => {
      try {
        const membership = await getCurrentMembership()
        if (!membership) throw new Error('Não identifiquei a clínica do seu usuário.')
        const numeros = await numerosDoInstagram(membership.clinicId, inicio, new Date())
        if (vivo) setDados(numeros)
      } catch (causa) {
        if (vivo) setErro(causa instanceof Error ? causa.message : 'Não consegui carregar os números.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [inicio])

  const assuntos = useMemo(() => (dados ? ordenar(dados.assuntos) : []), [dados])
  const botoes = useMemo(() => (dados ? ordenar(dados.botoes, NOME_DO_BOTAO) : []), [dados])
  const motivos = useMemo(() => (dados ? ordenar(dados.equipePorMotivo, NOME_DO_MOTIVO) : []), [dados])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold tracking-[-0.02em] text-[#193d36]">Números do Instagram</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            O que o robô fez no Direct, e o que sobrou para a equipe.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {PERIODOS.map((periodo) => (
            <button
              key={periodo.dias}
              type="button"
              onClick={() => setDias(periodo.dias)}
              className={`rounded-xl px-3 py-1.5 text-[10px] font-extrabold transition ${
                dias === periodo.dias ? 'bg-[#193d36] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {periodo.rotulo}
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
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Numero
              rotulo="Conversas"
              valor={dados.contatos}
              detalhe={`${dados.novos} pessoas escreveram pela primeira vez`}
              icone={Instagram}
              cor={ROSA}
            />
            <Numero
              rotulo="Resolvidas pelo robô"
              valor={porcento(dados.resolvidas, dados.contatos)}
              detalhe={`${dados.resolvidas} sem precisar da equipe`}
              icone={Bot}
              cor={SAGE}
            />
            <Numero
              rotulo="Pediram para agendar"
              valor={dados.pediramAgendar}
              detalhe={`${porcento(dados.pediramAgendar, dados.contatos)} das conversas`}
              icone={CalendarCheck2}
              cor={AZUL}
            />
            <Numero
              rotulo="Fora do horário"
              valor={dados.foraDoHorario}
              detalhe="começaram à noite ou no fim de semana"
              icone={MoonStar}
              cor="#7a6ea8"
            />
          </div>

          {inicio < EVENTOS_DESDE && (
            <div className="flex items-start gap-2 rounded-[16px] border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                A contagem do Instagram começou em <strong>02/10/2026</strong>. O período escolhido
                começa antes disso: número baixo aqui é período sem registro, não robô parado.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Bloco
              titulo="O que mais perguntam"
              subtitulo="Resposta pronta que o robô enviou"
              vazio="Nenhuma resposta enviada neste período."
              itens={assuntos}
              cor={AZUL}
            />
            <Bloco
              titulo="Botões mais tocados"
              subtitulo="Opções embaixo da mensagem do robô"
              vazio="Nenhum botão tocado neste período."
              itens={botoes}
              cor={ROSA}
            />
            <Bloco
              titulo="Por que a equipe foi chamada"
              subtitulo="Cada um gera aviso no celular da equipe"
              vazio="Nenhum chamado neste período."
              itens={motivos}
              cor={SAGE}
            />
          </div>

          <p className="text-[10px] leading-relaxed text-slate-400">
            Mensagens recebidas: {dados.mensagens} · respostas do robô: {dados.respostasRobo} · conversas em
            que a equipe escreveu: {dados.equipeRespondeu} · vieram de anúncio (quando a Meta informa):{' '}
            {dados.doAnuncio}. O texto das conversas não fica no sistema; ele continua no Meta Business Suite.
          </p>
        </>
      ) : null}
    </section>
  )
}
