/**
 * O audio do paciente em texto (porte de 18/11/2026 do sistema do Dr.
 * Marcello, onde nasceu em 25/10/2026 para o aviso dos celulares e passou a
 * valer para o robo em 09/11/2026; ver audio-como-texto.ts).
 *
 * Mesma Groq e mesmo modelo do ditado do prontuario (transcrever-audio), com a
 * chave GROQ_API_KEY so no servidor. Nunca lanca: em qualquer falha - sem
 * chave, recusa, demora - devolve o motivo, e o audio segue como anexo para a
 * equipe, do jeito de antes. O motivo existe porque aqui a falha tem de
 * aparecer na Central (ver avisoDoAudioSemTexto): na origem a funcao devolvia
 * so null, e um servidor sem a chave deixaria todo audio sem texto sem ninguem
 * saber por que.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3'
/** O webhook nao pode ficar esperando: passou disto, segue sem o texto. */
const ESPERA_MAXIMA_MS = 20_000
const TAMANHO_MAXIMO = 20 * 1024 * 1024

const EXTENSAO: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
}

/**
 * Por que nao houve texto:
 *  - sem_chave: o servidor nao tem a GROQ_API_KEY (a tela diz "nao configurada");
 *  - tamanho: audio vazio ou acima de 20 MB;
 *  - recusou: a Groq respondeu com erro (chave invalida, limite, fora do ar);
 *  - falhou: rede, ou passou do tempo de espera;
 *  - vazio: a Groq respondeu, mas sem fala nenhuma.
 */
export type MotivoSemTexto = 'sem_chave' | 'tamanho' | 'recusou' | 'falhou' | 'vazio'
export type Transcricao = { texto: string; motivo: null } | { texto: null; motivo: MotivoSemTexto; detalhe?: string }

type Opcoes = { chave?: string; buscar?: typeof fetch; esperaMs?: number }

export async function transcreverAudioComMotivo(bytes: Uint8Array, mime: string, opcoes: Opcoes = {}): Promise<Transcricao> {
  const chave = (opcoes.chave ?? (typeof Deno !== 'undefined' ? Deno.env.get('GROQ_API_KEY') : undefined))?.trim()
  if (!chave) {
    console.warn('Transcricao: sem GROQ_API_KEY no servidor; o audio segue como anexo, sem texto')
    return { texto: null, motivo: 'sem_chave' }
  }
  if (!bytes.length || bytes.length > TAMANHO_MAXIMO) {
    console.warn('Transcricao: audio vazio ou grande demais para transcrever', bytes.length)
    return { texto: null, motivo: 'tamanho' }
  }
  const tipo = mime.split(';')[0].trim().toLowerCase()
  const formulario = new FormData()
  formulario.append('file', new Blob([new Uint8Array(bytes)], { type: tipo || 'audio/ogg' }), `audio.${EXTENSAO[tipo] ?? 'ogg'}`)
  formulario.append('model', GROQ_MODEL)
  formulario.append('language', 'pt')
  formulario.append('response_format', 'json')

  const parar = new AbortController()
  // Na chegada do audio a espera e menor: o paciente esta esperando a resposta
  // do robo, e sem texto o audio segue como anexo, do jeito de antes.
  const relogio = setTimeout(() => parar.abort(), opcoes.esperaMs ?? ESPERA_MAXIMA_MS)
  try {
    const resposta = await (opcoes.buscar ?? fetch)(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}` },
      body: formulario,
      signal: parar.signal,
    })
    if (!resposta.ok) {
      const corpo = (await resposta.text().catch(() => '')).slice(0, 200)
      console.warn('Transcricao: a Groq recusou', resposta.status, corpo)
      return { texto: null, motivo: 'recusou', detalhe: `HTTP ${resposta.status}` }
    }
    const corpo = await resposta.json().catch(() => ({}))
    const texto = String((corpo as { text?: unknown })?.text ?? '').trim()
    return texto ? { texto, motivo: null } : { texto: null, motivo: 'vazio' }
  } catch (erro) {
    console.warn('Transcricao: falhou ou demorou demais; o audio segue sem texto', erro)
    return { texto: null, motivo: 'falhou' }
  } finally {
    clearTimeout(relogio)
  }
}

/** So o texto, como na origem: null em qualquer falha. */
export async function transcreverAudio(bytes: Uint8Array, mime: string, opcoes: Opcoes = {}): Promise<string | null> {
  return (await transcreverAudioComMotivo(bytes, mime, opcoes)).texto
}
