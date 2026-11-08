import { CalendarCheck, MessageSquareText } from 'lucide-react'
import type { ConsultaParaConfirmar } from '@/lib/repository'
import { situacaoDaConfirmacao } from '@/lib/situacao-da-confirmacao'

// "sexta, 30/10 às 10:40": o jeito do robo falar da consulta.
const QUANDO_DA_CONSULTA = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

function quandoDaConsulta(iso: string) {
  const partes = QUANDO_DA_CONSULTA.formatToParts(new Date(iso))
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${parte('weekday').replace('-feira', '')}, ${parte('day')}/${parte('month')} às ${parte('hour')}:${parte('minute')}`
}

/**
 * Faixa de confirmacao da consulta, na conversa (07/11/2026, portado do
 * sistema do Dr. Marcello, onde nasceu em 29/10).
 *
 * La, uma familia nao respondeu o lembrete da vespera, e a equipe nao tinha
 * como perguntar de novo pela Central. Aqui a equipe ve se o paciente ja
 * confirmou e quantas vezes o lembrete saiu, e pode mandar de novo: sai mesmo
 * com a janela de 24h fechada, por ser o modelo aprovado. Sem resposta, o
 * sistema tambem repete sozinho, ate 3 lembretes (ver lembrete-envio.ts).
 */
export default function FaixaDaConsulta({
  consulta,
  enviando,
  onRepetir,
  onConfirmada,
}: {
  consulta: ConsultaParaConfirmar
  enviando: boolean
  onRepetir: () => void
  onConfirmada: () => void
}) {
  const pendente = !consulta.confirmada && !consulta.pediuRemarcar
  const { texto: situacao, tom } = situacaoDaConfirmacao(consulta)
  const cores =
    tom === 'ok'
      ? 'border-[#237128]/20 bg-[#eaf3ec] text-[#237128]'
      : tom === 'erro'
        ? 'border-[#f3b4b4] bg-[#fde8e8] text-[#b42318]'
        : 'border-[#f0c36d] bg-[#fff8e6] text-[#8a5a00]'
  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border px-3.5 py-2.5 ${cores}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold">
        <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
        <span>
          Consulta {quandoDaConsulta(consulta.startsAt)}
          {consulta.unidade ? ` · ${consulta.unidade}` : ''} · {situacao}
        </span>
      </p>
      {pendente && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={onConfirmada}
            title="O paciente ou a família confirmou por ligação ou por outra mensagem. Para a repetição automática do lembrete."
            className="rounded-xl border border-[#193d36]/10 bg-white px-3 py-1.5 text-[10px] font-extrabold text-[#2f7f74] transition hover:bg-[#eef3f2] disabled:opacity-50"
          >
            Já confirmou
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={onRepetir}
            title="Manda de novo o lembrete, com os botões Confirmar presença e Preciso remarcar. Sai mesmo com a janela de 24h fechada."
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#193d36] px-3 py-1.5 text-[10px] font-extrabold text-white transition hover:bg-[#13453c] disabled:cursor-wait disabled:opacity-50"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            {enviando ? 'Enviando...' : consulta.lembretes === 0 ? 'Pedir confirmação' : 'Repetir confirmação'}
          </button>
        </div>
      )}
    </div>
  )
}
