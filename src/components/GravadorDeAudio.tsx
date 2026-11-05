import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { formatoDeGravacao, LIMITE_DA_GRAVACAO_S, nomeDaGravacao, tempoDeGravacao, type FormatoDeGravacao } from '@/lib/gravacao-de-audio'

/**
 * Botao de gravar audio da tela de Respostas (05/11/2026, ver
 * gravacao-de-audio.ts). Grava, e ao parar entrega o arquivo como se tivesse
 * vindo do botao Arquivo: a tela mostra para ouvir antes, e o Enviar manda.
 *
 * Nada sai sozinho ao parar: audio e mensagem em nome de alguem, e quem gravou
 * precisa poder ouvir e desistir.
 */
export function GravadorDeAudio({
  desativado,
  variante,
  onPronto,
  onErro,
}: {
  desativado?: boolean
  /** 'botao' na tela do computador; 'icone' na de celular. */
  variante: 'botao' | 'icone'
  onPronto: (arquivo: File) => void
  onErro: (mensagem: string) => void
}) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const gravador = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const descartar = useRef(false)
  const relogio = useRef<number | null>(null)

  // Saiu da tela gravando: solta o microfone, sem entregar nada.
  useEffect(
    () => () => {
      descartar.current = true
      if (relogio.current !== null) window.clearInterval(relogio.current)
      if (gravador.current?.state === 'recording') gravador.current.stop()
      gravador.current?.stream.getTracks().forEach((faixa) => faixa.stop())
    },
    [],
  )

  function parar(jogarFora: boolean) {
    descartar.current = jogarFora
    if (relogio.current !== null) window.clearInterval(relogio.current)
    relogio.current = null
    setGravando(false)
    if (gravador.current?.state === 'recording') gravador.current.stop()
    gravador.current = null
  }

  async function comecar() {
    const formato: FormatoDeGravacao | null =
      typeof MediaRecorder === 'undefined' ? null : formatoDeGravacao((tipo) => MediaRecorder.isTypeSupported(tipo))
    if (!formato) {
      onErro('Este navegador não grava áudio num formato que o WhatsApp aceita. Use o Chrome atualizado.')
      return
    }
    let fluxo: MediaStream
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (causa) {
      const nome = causa instanceof DOMException ? causa.name : ''
      onErro(
        nome === 'NotAllowedError'
          ? 'O navegador não deixou usar o microfone. Clique no cadeado ao lado do endereço, libere o microfone e tente de novo.'
          : nome === 'NotFoundError'
            ? 'Nenhum microfone encontrado neste computador.'
            : 'Não consegui ligar o microfone.',
      )
      return
    }
    pedacos.current = []
    descartar.current = false
    const novo = new MediaRecorder(fluxo, { mimeType: formato.gravador })
    novo.ondataavailable = (e) => {
      if (e.data.size) pedacos.current.push(e.data)
    }
    novo.onstop = () => {
      fluxo.getTracks().forEach((faixa) => faixa.stop())
      if (descartar.current || !pedacos.current.length) return
      // O tipo vai sem o "codecs": e assim que a Meta e o acervo esperam.
      const blob = new Blob(pedacos.current, { type: formato.mime })
      onPronto(new File([blob], nomeDaGravacao(new Date(), formato), { type: formato.mime }))
    }
    gravador.current = novo
    novo.start(1000)
    setSegundos(0)
    setGravando(true)
    // Passou do teto: para sozinho e entrega o que gravou.
    let contados = 0
    relogio.current = window.setInterval(() => {
      contados += 1
      setSegundos(contados)
      if (contados >= LIMITE_DA_GRAVACAO_S) parar(false)
    }, 1000)
  }

  if (gravando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => parar(true)}
          title="Jogar fora a gravação"
          aria-label="Jogar fora a gravação"
          className={variante === 'icone' ? 'rounded-full p-2 text-[#54656f]' : 'rounded-xl border border-[#193d36]/10 bg-white p-2 text-slate-500 hover:text-[#b42318]'}
        >
          <X className={variante === 'icone' ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
        </button>
        <button
          type="button"
          onClick={() => parar(false)}
          title="Parar e ouvir antes de enviar"
          className={
            variante === 'icone'
              ? 'mb-[6px] inline-flex items-center gap-1 rounded-full bg-[#fde8e7] px-3 py-2 text-[13px] font-semibold text-[#b42318]'
              : 'inline-flex items-center gap-1.5 rounded-xl border border-[#b42318]/30 bg-[#fde8e7] px-3 py-2 text-[10px] font-extrabold text-[#b42318]'
          }
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#b42318]" />
          <Square className="h-3 w-3 fill-current" />
          Parar {tempoDeGravacao(segundos)}
        </button>
      </span>
    )
  }

  if (variante === 'icone') {
    return (
      <button
        type="button"
        disabled={desativado}
        onClick={() => void comecar()}
        aria-label="Gravar áudio"
        className="mb-[6px] rounded-full p-2 text-[#54656f] active:bg-black/5 disabled:opacity-40"
      >
        <Mic className="h-5 w-5" />
      </button>
    )
  }
  return (
    <button
      type="button"
      disabled={desativado}
      onClick={() => void comecar()}
      title="Gravar um áudio para o paciente (você ouve antes de enviar)"
      className="inline-flex items-center gap-1.5 rounded-xl border border-[#193d36]/10 bg-white px-3 py-2 text-[10px] font-extrabold text-slate-600 transition hover:border-[#193d36]/25 hover:text-[#193d36] disabled:opacity-40"
    >
      <Mic className="h-3.5 w-3.5" />
      Gravar áudio
    </button>
  )
}
