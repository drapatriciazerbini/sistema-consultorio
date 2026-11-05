/**
 * Audio, foto e arquivo entre o celular da Dra. e o paciente (05/11/2026).
 *
 * Pedido do Edu: em 03/11/2026 a Dra. respondeu o aviso de um paciente com um
 * audio, e o sistema so anotou "por la so passa texto". O paciente ficou sem a
 * resposta, e a equipe teve de chamar no WhatsApp a mao. Agora o audio (ou foto,
 * video, arquivo) dela vai ao paciente depois do "Enviar", e o do paciente chega
 * ao celular dela como arquivo, e nao como "veja na Central".
 *
 * A Meta nao entrega o arquivo no webhook: entrega um id, que o numero do
 * consultorio troca por uma URL de poucos minutos (ver guardarAnexo no
 * meta-webhook). Para mandar a outra pessoa, o caminho documentado e baixar e
 * subir de novo pelo mesmo numero (POST /{numero}/media), que devolve um id
 * novo. A documentacao nao diz se o id recebido pode ser reenviado direto; por
 * isso nao se arrisca - um audio que some calado e pior do que um download a mais.
 *
 * Figurinha nao entra: e o "👍" de quem viu, nao mensagem ao paciente.
 */

export type TipoDeMidia = 'audio' | 'voice' | 'image' | 'video' | 'document' | 'sticker'
export const TIPOS_DE_MIDIA: TipoDeMidia[] = ['audio', 'voice', 'image', 'video', 'document', 'sticker']

export type MidiaRecebida = {
  tipo: TipoDeMidia
  /** O id da Meta, valido so para o numero que recebeu. */
  id: string
  mime?: string
  nome?: string
  legenda?: string
}

type BlocoDaMeta = { id?: string; mime_type?: string; filename?: string; caption?: string }

/** O arquivo da mensagem, como a Meta mandou. Sem id (ou figurinha), nada. */
export function midiaRecebida(m: { type?: string } & Partial<Record<TipoDeMidia, BlocoDaMeta>>): MidiaRecebida | null {
  const tipo = String(m?.type ?? '') as TipoDeMidia
  if (!TIPOS_DE_MIDIA.includes(tipo) || tipo === 'sticker') return null
  const bloco = m[tipo]
  if (!bloco?.id) return null
  return {
    tipo,
    id: String(bloco.id),
    ...(bloco.mime_type ? { mime: String(bloco.mime_type) } : {}),
    ...(bloco.filename ? { nome: String(bloco.filename) } : {}),
    ...(String(bloco.caption ?? '').trim() ? { legenda: String(bloco.caption).trim() } : {}),
  }
}

const ehAudio = (tipo: TipoDeMidia) => tipo === 'audio' || tipo === 'voice'

/** "este áudio", "esta foto": na pergunta "Vou mandar ... para Maria". */
export function esteArquivo(tipo: TipoDeMidia): string {
  if (ehAudio(tipo)) return 'este áudio'
  if (tipo === 'image') return 'esta foto'
  if (tipo === 'video') return 'este vídeo'
  return 'este arquivo'
}

/** "um áudio", "uma foto": em "Maria respondeu com ...". */
export function umArquivo(tipo: TipoDeMidia): string {
  if (ehAudio(tipo)) return 'um áudio'
  if (tipo === 'image') return 'uma foto'
  if (tipo === 'video') return 'um vídeo'
  return 'um arquivo'
}

/**
 * A mensagem para a Meta, com o id ja do numero do consultorio. Audio nao tem
 * legenda na Meta: quem manda avisa antes, numa mensagem de texto.
 */
export function conteudoDaMidia(midia: Pick<MidiaRecebida, 'tipo' | 'nome'>, id: string, legenda?: string): Record<string, unknown> {
  const tipo = midia.tipo === 'voice' ? 'audio' : midia.tipo
  const corpo: Record<string, unknown> = { id }
  if (legenda && (tipo === 'image' || tipo === 'video' || tipo === 'document')) corpo.caption = legenda.slice(0, 1024)
  if (tipo === 'document' && midia.nome) corpo.filename = midia.nome
  return { type: tipo, [tipo]: corpo }
}

export type CopiaDaMidia = { ok: true; id: string; bytes: Uint8Array; mime: string } | { ok: false; erro: string }

/** "audio/ogg; codecs=opus" -> "audio/ogg": o upload da Meta quer o tipo sem parametro. */
export function tipoLimpo(mime: string | undefined): string {
  return String(mime ?? '').split(';')[0].trim() || 'application/octet-stream'
}

function nomeDoArquivo(midia: MidiaRecebida, mime: string): string {
  if (midia.nome) return midia.nome
  const extensao = mime.split('/')[1]?.split('+')[0] || 'bin'
  return `${ehAudio(midia.tipo) ? 'audio' : midia.tipo === 'image' ? 'foto' : midia.tipo}.${extensao === 'jpeg' ? 'jpg' : extensao}`
}

/**
 * Baixa o arquivo recebido e sobe de novo pelo numero do consultorio. Nunca
 * lanca: o erro volta escrito, para quem mandou saber que nao chegou.
 */
export function copiaPelaApi(phoneNumberId: string, token: string | undefined, buscar: typeof fetch = fetch) {
  const versao = (typeof Deno !== 'undefined' ? Deno.env.get('META_GRAPH_VERSION')?.trim() : '') || 'v25.0'
  return async (midia: MidiaRecebida): Promise<CopiaDaMidia> => {
    if (!token) return { ok: false, erro: 'WhatsApp da clínica sem token no servidor' }
    try {
      // As duas chamadas do download vao autenticadas, como em guardarAnexo.
      const aviso = await buscar(`https://graph.facebook.com/${versao}/${midia.id}`, { headers: { Authorization: `Bearer ${token}` } })
      const info = await aviso.json().catch(() => ({}))
      if (!aviso.ok || !info?.url) return { ok: false, erro: `a Meta não entregou o arquivo (${info?.error?.message ?? `HTTP ${aviso.status}`})` }
      const arquivo = await buscar(String(info.url), { headers: { Authorization: `Bearer ${token}` } })
      if (!arquivo.ok) return { ok: false, erro: `não consegui baixar o arquivo (HTTP ${arquivo.status})` }
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const mime = tipoLimpo(midia.mime ?? info.mime_type)

      const formulario = new FormData()
      formulario.append('messaging_product', 'whatsapp')
      formulario.append('type', mime)
      formulario.append('file', new Blob([bytes], { type: mime }), nomeDoArquivo(midia, mime))
      const subida = await buscar(`https://graph.facebook.com/${versao}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formulario,
      })
      const j = await subida.json().catch(() => ({}))
      if (!subida.ok || !j?.id) return { ok: false, erro: `a Meta recusou o arquivo (${j?.error?.message ?? `HTTP ${subida.status}`})` }
      return { ok: true, id: String(j.id), bytes, mime }
    } catch (erro) {
      return { ok: false, erro: String(erro).slice(0, 200) }
    }
  }
}
