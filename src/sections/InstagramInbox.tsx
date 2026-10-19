import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bot, Instagram, Send, UserRound } from 'lucide-react'
import { useDialogos } from '@/components/dialogos-contexto'
import {
  listarConversasInstagram,
  listarMensagensInstagram,
  marcarInstagramComoLida,
  podeResponder,
  responderInstagram,
  type ConversaInstagram,
  type MensagemInstagram,
} from '@/lib/instagram'

/**
 * Chat do Direct do Instagram, na tela de Respostas (19/10/2026).
 *
 * Pedido do Edu: "quero que o Instagram da Patricia continue respondendo por
 * la, so queria ver a tela do chat... e se precisar respondemos da Central".
 * O robo segue igual no Direct. Aqui a equipe acompanha a conversa inteira
 * (pessoa, robo e equipe) e responde quando precisar. Responder daqui, como
 * pelo Business Suite, cala o robo nessa conversa por algumas horas.
 *
 * Atualiza a cada 15 s. O historico comeca em 19/10/2026: antes disso o
 * sistema nao guardava o texto do Direct.
 */
const NAVY = '#193d36'

function quando(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const DE_QUEM: Record<MensagemInstagram['autor'], string> = {
  pessoa: '',
  robo: 'Robô',
  equipe: 'Equipe',
}

export default function InstagramInbox({ clinicId }: { clinicId: string }) {
  const { avisar } = useDialogos()
  const [conversas, setConversas] = useState<ConversaInstagram[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<MensagemInstagram[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregou, setCarregou] = useState(false)
  const fim = useRef<HTMLLIElement | null>(null)

  const carregar = useCallback(async () => {
    try {
      setConversas(await listarConversasInstagram(clinicId))
      setErro(null)
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não consegui ler o Instagram.')
    } finally {
      setCarregou(true)
    }
  }, [clinicId])

  const carregarMensagens = useCallback(async (id: string) => {
    try {
      setMensagens(await listarMensagensInstagram(id))
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não consegui ler a conversa.')
    }
  }, [])

  useEffect(() => {
    void carregar()
    const relogio = setInterval(() => {
      void carregar()
      if (aberta) void carregarMensagens(aberta)
    }, 15000)
    return () => clearInterval(relogio)
  }, [carregar, carregarMensagens, aberta])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens.length, aberta])

  async function abrir(c: ConversaInstagram) {
    setAberta(c.id)
    setTexto('')
    setMensagens([])
    await carregarMensagens(c.id)
    if (c.naoLidas > 0) {
      await marcarInstagramComoLida(c.id)
      void carregar()
    }
  }

  const atual = useMemo(() => conversas.find((c) => c.id === aberta) ?? null, [conversas, aberta])
  const naoLidas = conversas.reduce((soma, c) => soma + c.naoLidas, 0)

  async function enviar() {
    if (!atual || !texto.trim()) return
    setEnviando(true)
    try {
      await responderInstagram(atual.id, texto.trim())
      setTexto('')
      await Promise.all([carregarMensagens(atual.id), carregar()])
    } catch (causa) {
      avisar(causa instanceof Error ? causa.message : 'Não foi possível enviar.', 'erro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="surface-card overflow-hidden rounded-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#193d36]/[0.06] p-4">
        <span className="flex items-center gap-2 text-sm font-extrabold text-[#193d36]">
          <Instagram className="h-4 w-4 text-[#c13584]" /> Direct do Instagram
          {naoLidas > 0 && <span className="rounded-full bg-[#c13584] px-2 py-0.5 text-[9px] font-extrabold text-white">{naoLidas} nova(s)</span>}
        </span>
        <span className="text-[10px] leading-relaxed text-slate-500">
          O robô continua respondendo no Direct. Se alguém da equipe responder (aqui ou no Business Suite), ele fica calado nessa conversa por 12 horas.
        </span>
      </div>

      {erro && (
        <p className="m-4 flex gap-2 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[11px] text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {erro}
        </p>
      )}

      <div className="grid min-h-[460px] md:grid-cols-[300px_minmax(0,1fr)]">
        <ul className="max-h-[70vh] overflow-y-auto border-b border-[#193d36]/[0.06] md:border-b-0 md:border-r">
          {carregou && conversas.length === 0 && !erro && (
            <li className="p-5 text-[11px] leading-relaxed text-slate-400">
              Nenhuma conversa ainda. Quando alguém escrever no Direct, ela aparece aqui com a resposta do robô. O histórico começa em
              19/10/2026: as conversas de antes ficaram só no Business Suite.
            </li>
          )}
          {conversas.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void abrir(c)}
                className={`w-full border-b border-[#193d36]/[0.04] px-4 py-3 text-left transition hover:bg-[#f4f8f6] ${aberta === c.id ? 'bg-[#eaf2ef]' : ''}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-extrabold text-[#193d36]">{c.nome}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{quando(c.ultimaMensagemEm)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                  {c.previaDe && c.previaDe !== 'pessoa' ? `${DE_QUEM[c.previaDe]}: ` : ''}
                  {c.previa}
                </span>
                {c.naoLidas > 0 && (
                  <span className="mt-1 inline-block rounded-full bg-[#c13584] px-2 py-0.5 text-[9px] font-extrabold text-white">{c.naoLidas} nova(s)</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex min-w-0 flex-col">
          {!atual ? (
            <p className="m-auto p-6 text-center text-[11px] text-slate-400">Escolha uma conversa.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#193d36]/[0.06] px-4 py-3">
                <span className="text-xs font-extrabold text-[#193d36]">{atual.nome}</span>
                {atual.equipeRespondeuEm && Date.now() - Date.parse(atual.equipeRespondeuEm) < 12 * 3_600_000 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold text-amber-800">
                    Com a equipe: robô calado até {quando(new Date(Date.parse(atual.equipeRespondeuEm) + 12 * 3_600_000).toISOString())}
                  </span>
                )}
              </div>
              <ol className="max-h-[55vh] flex-1 space-y-2 overflow-y-auto bg-[#f7f5ef] p-4">
                {mensagens.map((m) => (
                  <li key={m.id} className={`flex ${m.direcao === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[16px] px-3 py-2 text-[12px] leading-relaxed ${
                        m.direcao === 'inbound'
                          ? 'bg-white text-[#193d36]'
                          : m.autor === 'robo'
                            ? 'bg-[#2f7f74] text-white'
                            : 'bg-[#193d36] text-white'
                      }`}
                    >
                      {m.direcao === 'outbound' && (
                        <span className="mb-0.5 flex items-center gap-1 text-[9px] font-extrabold text-white/70">
                          {m.autor === 'robo' ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />} {DE_QUEM[m.autor]}
                        </span>
                      )}
                      {m.texto}
                      <span className={`mt-1 block text-[9px] ${m.direcao === 'outbound' ? 'text-white/50' : 'text-slate-400'}`}>
                        {quando(m.createdAt)}
                        {m.status === 'falhou' && <strong className="ml-1 text-red-200">não enviada{m.erro ? `: ${m.erro}` : ''}</strong>}
                      </span>
                    </div>
                  </li>
                ))}
                <li ref={fim} aria-hidden="true" />
              </ol>
              {podeResponder(atual) ? (
                <div className="flex items-end gap-2 border-t border-[#193d36]/[0.06] p-3">
                  <textarea
                    id="instagram-resposta"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="Responder no Direct…"
                    className="min-w-0 flex-1 resize-none rounded-[14px] border border-[#193d36]/10 bg-white p-2.5 text-[12px] text-[#193d36] outline-none focus:border-[#2f7f74]/50"
                  />
                  <button
                    type="button"
                    disabled={enviando || !texto.trim()}
                    onClick={() => void enviar()}
                    aria-label="Enviar"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
                    style={{ background: NAVY }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="border-t border-[#193d36]/[0.06] p-3 text-[10px] leading-relaxed text-slate-500">
                  Passaram 24 horas desde a última mensagem desta pessoa: o Instagram não deixa responder pelo sistema. Responda pelo app do
                  Instagram ou espere ela escrever de novo.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
