import { useRef, useState } from 'react'
import { FileText, Send, X } from 'lucide-react'
import { sendDocumentOutsideWindow } from '@/lib/repository'
import {
  nomeDoArquivo,
  TIPOS_DE_ARQUIVO,
  TIPOS_DE_DOCUMENTO,
  type TipoDeDocumento,
} from '../../supabase/functions/_shared/documento.ts'

/**
 * Documento com a janela de 24 horas fechada (07/11/2026, portado do sistema
 * do Dr. Marcello, onde nasceu em 28/10): receita, 2a via, atestado, pedido de
 * exame.
 *
 * La, a receita refeita na Memed esperava a familia escrever de novo para
 * poder sair, porque com a janela fechada a tela so oferecia texto ou convite.
 * Aqui e igual: o pedido de 2a via da filha chega de noite e a Dra. refaz a
 * receita no dia seguinte, com a janela ja fechada. O arquivo vai no modelo
 * documento_do_consultorio (ver supabase/functions/_shared/documento.ts), com
 * a frase em volta.
 *
 * Um componente para os dois visuais da tela (o painel e o modo WhatsApp do
 * celular), montado com key da conversa: trocar de conversa zera o que estava
 * escolhido, e um PDF da Ana nunca fica pronto para sair na conversa do Joao.
 */
export default function DocumentoForaDaJanela({
  conversationId,
  pacienteSugerido,
  consultorio,
  onEnviado,
  compacto = false,
}: {
  conversationId: string
  /** Primeiro nome do paciente da conversa, quando ha cadastro. A equipe pode trocar (filha que cuida dos dois pais). */
  pacienteSugerido: string
  /** "o consultório da Dra. Patrícia Zerbini": so para a previa. */
  consultorio: string
  onEnviado: () => void | Promise<void>
  /** Modo WhatsApp: comeca fechado, num link. */
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(!compacto)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [tipo, setTipo] = useState<TipoDeDocumento>('receita')
  const [paciente, setPaciente] = useState(pacienteSugerido)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const seletor = useRef<HTMLInputElement>(null)

  function escolher(escolhido: File | null) {
    setAviso('')
    if (!escolhido) return
    // O servidor recusa do mesmo jeito; aqui e para nao subir 15 MB a toa.
    if (!TIPOS_DE_ARQUIVO.includes(escolhido.type)) {
      setAviso('Envie o documento em PDF (ou Word). Foto não vai neste modelo.')
      return
    }
    setArquivo(escolhido)
  }

  async function enviar() {
    if (!arquivo || !paciente.trim() || enviando) return
    setEnviando(true)
    setAviso('')
    try {
      await sendDocumentOutsideWindow(conversationId, arquivo, tipo, paciente.trim())
      setArquivo(null)
      if (compacto) setAberto(false)
      await onEnviado()
    } catch (causa) {
      setAviso(causa instanceof Error ? causa.message : 'Não foi possível enviar o documento.')
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-1 block font-semibold text-[#008069]">
        Mandar documento (receita, atestado)
      </button>
    )
  }

  const campo =
    'rounded-xl border border-[#2f7f74]/25 bg-white px-3 py-2 text-[11px] font-semibold text-[#193d36] outline-none transition focus:border-[#2f7f74] focus:ring-4 focus:ring-[#2f7f74]/10'

  return (
    <div className="mt-3 border-t border-[#2f7f74]/20 pt-3">
      <p className="text-[11px] font-extrabold text-[#17564d]">Mandar documento</p>
      <p className="mt-0.5 text-[10px] font-semibold text-[#17564d]/80">
        Receita, 2ª via, atestado ou outro PDF. Sai agora, mesmo com a janela fechada, dentro do modelo
        aprovado de documento.
      </p>
      <input
        ref={seletor}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf"
        className="hidden"
        onChange={(evento) => {
          escolher(evento.target.files?.[0] ?? null)
          evento.target.value = ''
        }}
      />
      {!arquivo ? (
        <button
          type="button"
          onClick={() => seletor.current?.click()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#17564d]/30 bg-white px-4 py-2 text-[10px] font-extrabold text-[#17564d] transition hover:bg-[#f6f3eb]"
        >
          <FileText className="h-3.5 w-3.5" />
          Escolher o PDF
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-[#193d36]">
            <FileText className="h-4 w-4 shrink-0 text-[#17564d]" />
            <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
            <button type="button" onClick={() => setArquivo(null)} aria-label="Tirar o arquivo" className="shrink-0 text-slate-400 hover:text-[#193d36]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeDocumento)} className={campo} aria-label="Qual documento">
              {(Object.keys(TIPOS_DE_DOCUMENTO) as TipoDeDocumento[]).map((id) => (
                <option key={id} value={id}>{TIPOS_DE_DOCUMENTO[id].rotulo}</option>
              ))}
            </select>
            <input
              value={paciente}
              onChange={(e) => setPaciente(e.target.value)}
              maxLength={60}
              placeholder="Nome do paciente"
              aria-label="Nome do paciente"
              className={`${campo} min-w-0 flex-1`}
            />
          </div>
          {/* A previa e o que chega no celular: o arquivo com o nome que o
              servidor da (nao o "rx_8f3a1c.pdf" da Memed) e a frase do modelo. O
              nome de quem le o servidor completa (responsavel ou perfil). */}
          <p className="rounded-xl bg-white/70 px-3 py-2 text-[10px] font-semibold italic leading-relaxed text-[#17564d]">
            📄 {nomeDoArquivo(tipo, paciente, arquivo.name)}
            <br />
            Olá, [nome]. Aqui é {consultorio}. Segue em anexo {TIPOS_DE_DOCUMENTO[tipo].frase} de{' '}
            {paciente.trim() || '[paciente]'}. Se tiver alguma dúvida, é só responder por aqui.
          </p>
          <button
            type="button"
            disabled={enviando || !paciente.trim()}
            onClick={() => void enviar()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#193d36] px-4 py-2 text-[10px] font-extrabold text-white transition hover:bg-[#13453c] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            {enviando ? 'Enviando...' : 'Enviar documento'}
          </button>
        </div>
      )}
      {aviso && <p className="mt-2 text-[10px] font-bold text-[#b42318]">{aviso}</p>}
    </div>
  )
}
