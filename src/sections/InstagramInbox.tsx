import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bot, ExternalLink, Instagram, Paperclip, Send, UserRound } from 'lucide-react'
import { useDialogos } from '@/components/dialogos-contexto'
import { VisualizadorDeArquivo, type ArquivoAberto } from '@/components/VisualizadorDeArquivo'
import {
  chaveDoInstagramRecusadaEm,
  linkDoAnexoInstagram,
  listarConversasInstagram,
  listarMensagensInstagram,
  marcarInstagramComoLida,
  podeResponder,
  responderInstagram,
  type AnexoInstagram,
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

/** Nome de cada tipo de anexo da Meta, para o aviso de "nao guardado". */
const NOME_DO_ANEXO: Record<string, string> = {
  image: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
  media: 'Mídia',
  share: 'Post compartilhado',
  ig_post: 'Post compartilhado',
  ig_reel: 'Reel compartilhado',
  reel: 'Reel compartilhado',
  story_mention: 'Menção nos stories',
  ig_story: 'Story',
  story: 'Story compartilhado',
}

/** Texto que e so rotulo de anexo ("[foto]", "[áudio] [foto]"): some quando o anexo aparece. */
const SO_ROTULOS = /^(\[[^\]]*\]\s*)+$/

/** Minutos em que o anexo sem arquivo ainda conta como "guardando". */
const COPIANDO_MS = 2 * 60_000

/**
 * Anexo dentro do balao (08/11/2026).
 *
 * Mesmas escolhas do WhatsApp: foto abre por cima da tela, audio e video tocam
 * ali mesmo, e o link de cinco minutos e renovado no clique ou quando a previa
 * falha. O link fica no estado: a conversa recarrega a cada 15 s com links
 * novos, e trocar o src no meio reiniciaria o audio que alguem estiver ouvindo.
 *
 * Sem arquivo guardado, diz isso com todas as letras - nos primeiros minutos
 * como "carregando" (a copia roda depois da resposta do robo), depois como
 * "nao guardado", com o link original da Meta, que pode ja ter vencido.
 */
function AnexoDoDirect({
  anexo,
  criadoEm,
  agora,
  escuro,
  onAbrir,
}: {
  anexo: AnexoInstagram
  criadoEm: string
  /** Do relogio de 15 s da tela: "carregando" vira "nao guardado" sozinho. */
  agora: number
  escuro: boolean
  onAbrir: (arquivo: ArquivoAberto) => void
}) {
  const [url, setUrl] = useState(anexo.url)
  const [erro, setErro] = useState('')
  const renovou = useRef(false)
  const mime = anexo.mime ?? ''
  const nome = NOME_DO_ANEXO[anexo.tipo] ?? `Anexo (${anexo.tipo})`

  async function linkNovo() {
    if (!anexo.caminho) throw new Error('Arquivo não guardado.')
    const novo = await linkDoAnexoInstagram(anexo.caminho)
    setUrl(novo)
    return novo
  }

  function renovarUmaVez() {
    if (renovou.current) return
    renovou.current = true
    void linkNovo().catch(() => undefined)
  }

  async function abrir() {
    setErro('')
    try {
      onAbrir({ url: await linkNovo(), mime: anexo.mime, titulo: nome })
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não consegui abrir o anexo.')
    }
  }

  if (anexo.caminho && url) {
    if (mime.startsWith('image/')) {
      return (
        <button type="button" onClick={() => void abrir()} className="mb-1 block w-full" title="Ver a foto">
          <img src={url} alt={nome} loading="lazy" onError={renovarUmaVez} className="max-h-[320px] w-full rounded-[10px] object-cover" />
          {erro && <span className="block text-[10px] font-bold text-red-600">{erro}</span>}
        </button>
      )
    }
    if (mime.startsWith('audio/')) {
      return <audio src={url} controls preload="none" onError={renovarUmaVez} className="mb-1 w-[260px] max-w-full" />
    }
    if (mime.startsWith('video/')) {
      return <video src={url} controls preload="metadata" onError={renovarUmaVez} className="mb-1 max-h-[320px] w-full rounded-[10px]" />
    }
    return (
      <>
        <button
          type="button"
          onClick={() => void abrir()}
          className={`mb-1 flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[11px] font-bold transition ${escuro ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'}`}
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" /> Abrir {nome.toLowerCase()}
        </button>
        {erro && <span className="block text-[10px] font-bold text-red-600">{erro}</span>}
      </>
    )
  }

  const copiando = !anexo.caminho && agora - Date.parse(criadoEm) < COPIANDO_MS
  return (
    <span className={`mb-1 flex flex-wrap items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[10px] font-bold ${escuro ? 'bg-white/10' : 'bg-amber-50 text-amber-800'}`}>
      <Paperclip className="h-3 w-3 shrink-0" />
      {copiando ? `${nome}: carregando o arquivo…` : `${nome}: não foi guardado na Central`}
      {anexo.original && (
        <a href={anexo.original} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 underline">
          abrir o original <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  )
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
  const [chaveRecusadaEm, setChaveRecusadaEm] = useState<string | null>(null)
  const [arquivoAberto, setArquivoAberto] = useState<ArquivoAberto | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const fim = useRef<HTMLLIElement | null>(null)

  const carregar = useCallback(async () => {
    void chaveDoInstagramRecusadaEm(clinicId).then(setChaveRecusadaEm)
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
      setAgora(Date.now())
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
          {chaveRecusadaEm
            ? 'O robô está parado: veja o aviso abaixo.'
            : 'O robô continua respondendo no Direct. Se alguém da equipe responder (aqui ou no Business Suite), ele fica calado nessa conversa por 12 horas.'}
        </span>
      </div>

      {chaveRecusadaEm && (
        <p className="m-4 flex gap-2 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[11px] leading-relaxed text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>O robô do Instagram não está respondendo ninguém.</strong> A Meta recusou a chave de acesso (visto em {quando(chaveRecusadaEm)}),
            e quem escreve no Direct fica sem resposta até alguém trocar a chave: em developers.facebook.com, app Central de Cuidado Patricia, API do
            Instagram, Configuração da API com login do Instagram, Gerar token na linha drapatriciazerbini; depois salvar no segredo INSTAGRAM_PAGE_TOKEN
            do Supabase. A faixa some na primeira resposta que o robô conseguir enviar.
          </span>
        </p>
      )}

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
                      {m.anexos.map((anexo, i) => (
                        <AnexoDoDirect
                          // O caminho na chave: quando a copia termina, o anexo
                          // remonta e pega o link; antes disso o estado guardaria o vazio.
                          key={`${m.id}-${i}-${anexo.caminho ?? ''}`}
                          anexo={anexo}
                          criadoEm={m.createdAt}
                          agora={agora}
                          escuro={m.direcao === 'outbound'}
                          onAbrir={setArquivoAberto}
                        />
                      ))}
                      {/* "[foto]" embaixo da propria foto e ruido; rotulo de anexo que nao apareceu fica. */}
                      {m.anexos.length > 0 && m.anexos.every((a) => a.caminho) && SO_ROTULOS.test(m.texto.trim()) ? null : m.texto}
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
      <VisualizadorDeArquivo arquivo={arquivoAberto} onFechar={() => setArquivoAberto(null)} />
    </section>
  )
}
