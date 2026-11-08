import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, MessageCircleOff, X } from 'lucide-react'
import { remanejarConsulta, type Appointment } from '@/lib/repository'
import { hojeEmSaoPaulo } from '@/lib/dados-para-memed'
import {
  camposDoRemanejamento,
  duracaoEmMinutos,
  impedimentoDoEncaixe,
  impedimentoDoRemanejamento,
  instanteEmSaoPaulo,
  type ConsultaOcupada,
} from '@/lib/remanejar'

/**
 * Mudar o dia e o horario da consulta, sem cancelar (07/11/2026, portado do
 * sistema do Dr. Marcello, onde nasceu em 28/10).
 *
 * Abre dentro do painel da consulta, como o Marcar retorno do prontuario. Os
 * horarios livres sao os do dia escolhido, sem o limite de dias do robo. O
 * encaixe e para o horario fora da grade, e so sai no fim do dia e com a
 * autorizacao da Dra. Patricia marcada (ver impedimentoDoEncaixe).
 */

const DIA = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

/** "qua, 28/10 às 17:20" */
function quando(iso: string) {
  const data = new Date(iso)
  return `${DIA.format(data).replace('.', '')} às ${HORA.format(data)}`
}

export default function RemanejarConsulta({
  consulta,
  ocupadas,
  duracaoPadrao,
  horariosDoDia,
  onFechar,
  onRemanejado,
}: {
  consulta: Appointment
  /** Consultas e reservas da unidade, para conferir o encaixe. */
  ocupadas: readonly ConsultaOcupada[]
  duracaoPadrao: number
  horariosDoDia: (dia: string) => Promise<string[]>
  onFechar: () => void
  onRemanejado: (mensagem: string) => void
}) {
  const hoje = hojeEmSaoPaulo()
  const [dia, setDia] = useState(hoje)
  const [horarios, setHorarios] = useState<string[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [encaixe, setEncaixe] = useState('')
  const [autorizado, setAutorizado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!dia) return
    let vivo = true
    setBuscando(true)
    setEscolhido(null)
    setEncaixe('')
    setAutorizado(false)
    setErro('')
    horariosDoDia(dia)
      .then((lista) => {
        if (vivo) setHorarios(lista)
      })
      .catch((causa) => {
        if (vivo) {
          setHorarios([])
          setErro(causa instanceof Error ? causa.message : 'Não consegui buscar os horários.')
        }
      })
      .finally(() => {
        if (vivo) setBuscando(false)
      })
    return () => {
      vivo = false
    }
  }, [dia, horariosDoDia])

  const duracao = duracaoEmMinutos(consulta, duracaoPadrao)
  const alvo = encaixe ? instanteEmSaoPaulo(dia, encaixe) : escolhido
  const impedimento = alvo
    ? impedimentoDoRemanejamento(consulta, alvo, duracao, ocupadas, new Date()) ??
      (encaixe ? impedimentoDoEncaixe(consulta, alvo, dia, duracao, horarios ?? [], ocupadas, autorizado) : null)
    : null

  async function confirmar() {
    if (!alvo || impedimento) return
    setSalvando(true)
    setErro('')
    try {
      await remanejarConsulta(consulta.id, camposDoRemanejamento(consulta, alvo, duracao))
      onRemanejado(
        `Consulta de ${consulta.patientName} remanejada para ${quando(alvo)}. ` +
          'O paciente não recebeu mensagem: avise pelo WhatsApp ou por telefone.',
      )
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'A consulta não foi remanejada.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-[16px] border border-[#2f7f74]/25 bg-[#eef3f2] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[#17564d]">
          <CalendarClock className="h-4 w-4" /> Mudar data e horário
        </p>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">
        Horário atual: <b className="text-[#193d36]">{quando(consulta.startsAt)}</b>.
      </p>

      <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
        Novo dia
        <input
          type="date"
          min={hoje}
          value={dia}
          onChange={(evento) => setDia(evento.target.value)}
          className="mt-1 block w-full rounded-xl border border-[#193d36]/10 bg-white px-3 py-2 text-[12px] font-semibold normal-case tracking-normal text-[#193d36] outline-none focus:border-[#2f7f74]"
        />
      </label>

      <div className="mt-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Horários livres</p>
        {buscando ? (
          <p className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando horários...
          </p>
        ) : horarios && horarios.length === 0 && !erro ? (
          <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
            Nenhum horário livre nesse dia. Escolha outro dia.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(horarios ?? []).map((inicio) => (
              <button
                key={inicio}
                type="button"
                onClick={() => {
                  setEscolhido(inicio)
                  setEncaixe('')
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  !encaixe && escolhido === inicio
                    ? 'bg-[#193d36] text-white'
                    : 'border border-[#193d36]/10 bg-white text-[#193d36] hover:border-[#2f7f74]/40'
                }`}
              >
                {HORA.format(new Date(inicio))}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fora da grade. O choque com quem ja esta marcado e conferido do mesmo
          jeito (impedimentoDoRemanejamento), e desde 29/10/2026 o encaixe so
          sai no fim do dia, com a autorizacao da Dra. marcada
          (impedimentoDoEncaixe). */}
      <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
        Ou encaixe no fim do dia
        <span className="mt-0.5 block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
          Só com autorização da Dra. Patrícia, começando depois do último horário do dia.
        </span>
        <input
          type="time"
          value={encaixe}
          onChange={(evento) => {
            setEncaixe(evento.target.value)
            setEscolhido(null)
          }}
          className="mt-1 block w-32 rounded-xl border border-[#193d36]/10 bg-white px-3 py-2 text-[12px] font-semibold normal-case tracking-normal text-[#193d36] outline-none focus:border-[#2f7f74]"
        />
      </label>
      {encaixe && (
        <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-[#193d36]">
          <input
            type="checkbox"
            checked={autorizado}
            onChange={(evento) => setAutorizado(evento.target.checked)}
            className="h-4 w-4 rounded border-[#193d36]/30"
          />
          A Dra. Patrícia autorizou este encaixe
        </label>
      )}

      <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#e3ece9] px-3.5 py-3 text-[11px] font-bold leading-relaxed text-[#2f5a50]">
        <MessageCircleOff className="mt-px h-4 w-4 shrink-0" />
        <span>
          Ninguém recebe mensagem e nada é cancelado: a consulta é a mesma, com a ficha, o convênio e o
          prontuário. Combine o novo horário com o paciente ou a família.
          {dia === hoje && ' Para hoje não sai lembrete.'}
        </span>
      </p>

      {alvo && impedimento && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-[#93370d]">
          {impedimento}
        </p>
      )}
      {erro && (
        <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={!alvo || Boolean(impedimento) || salvando}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#193d36] px-3.5 py-2 text-[11px] font-extrabold text-white transition hover:bg-[#13453c] disabled:opacity-40"
      >
        {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {alvo && !impedimento ? `Remanejar para ${quando(alvo)}` : 'Escolha o novo horário'}
      </button>
    </div>
  )
}
