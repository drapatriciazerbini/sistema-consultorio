/**
 * Que arquivo a equipe pode mandar pela tela de Respostas, e como a Meta o
 * recebe (24/09/2026; audio desde 05/11/2026, ver src/lib/gravacao-de-audio.ts).
 *
 * Limites da Meta: imagem ate 5 MB, audio ate 16 MB, documento ate 100 MB - mas
 * o acervo da clinica aceita 20 MB. Audio nao tem legenda na Meta: o texto vai
 * em mensagem separada (a tela manda antes do audio).
 */

export type TipoDoArquivo = 'image' | 'document' | 'audio'

const DOCUMENTOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

// So os que a Meta aceita como audio. WebM, o padrao do gravador do Chrome,
// fica de fora de proposito: a Meta recusaria depois do upload.
const AUDIOS = ['audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/amr']

/** Como a Meta recebe cada tipo, e o limite de tamanho de cada um. Tipo recusado: nulo. */
export function classificarArquivo(mime: string): { tipo: TipoDoArquivo; limite: number } | null {
  // "audio/ogg; codecs=opus" conta como "audio/ogg".
  const tipo = String(mime ?? '').split(';')[0].trim().toLowerCase()
  if (tipo === 'image/jpeg' || tipo === 'image/png') return { tipo: 'image', limite: 5 * 1048576 }
  if (AUDIOS.includes(tipo)) return { tipo: 'audio', limite: 16 * 1048576 }
  return DOCUMENTOS.includes(tipo) ? { tipo: 'document', limite: 20 * 1048576 } : null
}

/** "imagem", "áudio", "documento": nas mensagens de erro. */
export function nomeDoTipo(tipo: TipoDoArquivo): string {
  return tipo === 'image' ? 'imagem' : tipo === 'audio' ? 'áudio' : 'documento'
}
