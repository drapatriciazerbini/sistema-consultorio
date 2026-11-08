import { useEffect, useRef, useState } from 'react'
import { FilePlus2, Loader2, Pill } from 'lucide-react'
import { registrarAdendo, type Adendo } from '@/lib/prontuario-extra'
import { textoDoAdendo } from '@/lib/receita-no-texto'
import type { Receita } from '@/lib/repository'

/**
 * Adendos de um atendimento assinado (25/09/2026).
 *
 * O original nao muda; o adendo entra embaixo, com data, hora e autor, e
 * nunca mais sai (ver a migration). Por isso o botao pede uma confirmacao
 * antes de gravar: nao ha "desfazer" para um adendo.
 *
 * Memed dentro do adendo (07/11/2026, portado do sistema do Dr. Marcello, onde
 * entrou em 06/11 como pedido urgente do Edu): atendimento
 * assinado nao tinha botao de prescrever, e receita nova depois da assinatura
 * nao tinha onde entrar. Agora a Memed abre daqui; a receita se pendura neste
 * atendimento (como sempre) e os itens entram no texto do adendo. So contam as
 * receitas que nasceram com o adendo aberto: as antigas ja estao no atendimento.
 */

const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

export function AdendosDaConsulta({
  clinicId,
  patientId,
  consultationId,
  adendos,
  receitas,
  prescrevendo,
  onPrescrever,
  onRegistrado,
}: {
  clinicId: string | null
  patientId: string
  consultationId: string
  adendos: Adendo[]
  /** Receitas Memed deste atendimento, ja atualizadas quando uma nova e emitida. */
  receitas: Receita[]
  prescrevendo: boolean
  onPrescrever: () => void
  onRegistrado: () => void
}) {
  const [escrevendo, setEscrevendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')
  // Receitas que ja existiam quando o adendo abriu: essas nao entram nele.
  const [jaExistiam, setJaExistiam] = useState<Set<string>>(new Set())

  // Cancelada na Memed antes de registrar: sai do adendo.
  const novas = escrevendo ? receitas.filter((r) => !jaExistiam.has(r.id) && !r.excluidaEm) : []
  const final = textoDoAdendo(texto, novas)
  const daMemed = final.slice(texto.trim().length).trim()

  // Receita nova chegou: traz o adendo para a tela, com o botao de registrar.
  // Quando a Memed fecha, o medico volta direto para onde estava, e nao para
  // um aviso no topo do prontuario (06/11/2026).
  const caixaDaMemed = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (novas.length) caixaDaMemed.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [novas.length])

  function abrir() {
    setJaExistiam(new Set(receitas.map((r) => r.id)))
    setEscrevendo(true)
  }

  function fechar() {
    // A receita ja esta guardada em "Receitas emitidas"; o que se perde e so a
    // anotacao no adendo. Perguntar antes, porque isso nao volta sozinho.
    if (novas.length && !window.confirm('A receita já foi emitida e continua em "Receitas emitidas", mas não vai entrar em adendo. Sair sem registrar?')) return
    setEscrevendo(false)
    setTexto('')
    setErro('')
  }

  async function gravar() {
    if (!clinicId || !final) return
    if (!window.confirm('Registrar este adendo? Depois de gravado ele não pode ser alterado nem apagado.')) return
    setGravando(true)
    setErro('')
    try {
      await registrarAdendo(clinicId, patientId, consultationId, final)
      setTexto('')
      setEscrevendo(false)
      onRegistrado()
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'O adendo não foi registrado.')
    } finally {
      setGravando(false)
    }
  }

  return (
    <div>
      {adendos.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Adendos</p>
          {adendos.map((adendo) => (
            <div key={adendo.id} className="rounded-[14px] border border-[#b54708]/20 bg-[#fffaf2] px-4 py-3">
              <p className="text-[10px] font-extrabold text-[#93370d]">
                Adendo de {DATA_E_HORA.format(new Date(adendo.criadoEm))}
                {adendo.autorNome ? ` · ${adendo.autorNome}` : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#193d36]">{adendo.texto}</p>
            </div>
          ))}
        </div>
      )}

      {escrevendo ? (
        <div className="mt-3 rounded-[14px] border border-[#b54708]/25 bg-white p-3">
          <p className="text-[11px] font-bold text-[#93370d]">
            O atendimento assinado continua como está. O adendo fica registrado embaixo, com a data de hoje e o seu nome.
          </p>
          <textarea
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={4}
            maxLength={20000}
            autoFocus
            placeholder="Ex.: A família pediu nova receita. Onde se lê 5 mL, leia-se 2,5 mL. Resultado do exame chegou: ..."
            className="mt-2 w-full rounded-xl border border-[#193d36]/10 px-3 py-2 text-[13px] text-[#193d36] outline-none focus:border-[#b54708]/50"
          />
          {/* O que veio da Memed aparece antes de gravar, exatamente como vai
              ficar: o adendo nao se corrige depois. */}
          {daMemed && (
            <div ref={caixaDaMemed} className="mt-2 rounded-xl border border-[#1f5f55]/15 bg-[#f1f8f5] px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#1f5f55]">Vai junto no adendo</p>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#193d36]">{daMemed}</p>
            </div>
          )}
          {erro && <p className="mt-2 text-[11px] font-bold text-red-600">{erro}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void gravar()}
              disabled={gravando || !final}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#93370d] px-3.5 py-2 text-[11px] font-extrabold text-white disabled:opacity-40"
            >
              {gravando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Registrar adendo
            </button>
            <button
              type="button"
              onClick={onPrescrever}
              disabled={gravando || prescrevendo}
              title="Abre a Memed. O que for emitido entra neste adendo."
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2563eb]/20 bg-[#f9f7f2] px-3.5 py-2 text-[11px] font-extrabold text-[#1f5f55] transition hover:bg-[#f4f1e9] disabled:cursor-wait disabled:opacity-70"
            >
              {prescrevendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pill className="h-3.5 w-3.5" />}
              Prescrever pela Memed
            </button>
            <button
              type="button"
              onClick={fechar}
              disabled={gravando}
              className="rounded-xl border border-[#193d36]/10 bg-white px-3.5 py-2 text-[11px] font-bold text-slate-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#b54708]/25 bg-[#fffaf2] px-3 py-2 text-[10px] font-extrabold text-[#93370d] transition hover:bg-[#fef3e2]"
        >
          <FilePlus2 className="h-3.5 w-3.5" /> Adicionar adendo
        </button>
      )}
    </div>
  )
}
