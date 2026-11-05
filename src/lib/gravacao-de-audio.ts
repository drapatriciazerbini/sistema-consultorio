/**
 * Gravar audio na tela de Respostas (05/11/2026).
 *
 * Pedido do Edu: o botao de gravar, ao lado do Arquivo, como no WhatsApp. O
 * detalhe que decide se funciona e o formato. O WhatsApp so aceita audio AAC,
 * MP3, AMR, MP4 (AAC) ou OGG com Opus - e o padrao do gravador do Chrome e
 * WebM, que a Meta recusa. Conferido no Chrome do consultorio em 05/11/2026:
 * ele grava 'audio/mp4;codecs=mp4a.40.2' (AAC dentro de MP4), aceito sem
 * conversao. O Firefox grava OGG com Opus, tambem aceito. Navegador que so
 * grava WebM fica sem o botao funcionando, e a tela diz por que, em vez de
 * mandar um arquivo que a Meta recusaria depois.
 *
 * Regra pura: o teste (tests/gravacao-de-audio.test.mjs) passa o
 * isTypeSupported que quiser.
 */

export type FormatoDeGravacao = {
  /** O que se pede ao MediaRecorder. */
  gravador: string
  /** O tipo do arquivo para a Meta, sem parametro. */
  mime: string
  extensao: string
}

const FORMATOS: FormatoDeGravacao[] = [
  { gravador: 'audio/mp4;codecs=mp4a.40.2', mime: 'audio/mp4', extensao: 'm4a' },
  { gravador: 'audio/ogg;codecs=opus', mime: 'audio/ogg', extensao: 'ogg' },
]

/** O primeiro formato que o navegador grava e o WhatsApp aceita; nenhum, nulo. */
export function formatoDeGravacao(suporta: (tipo: string) => boolean): FormatoDeGravacao | null {
  return FORMATOS.find((formato) => {
    try {
      return suporta(formato.gravador)
    } catch {
      return false
    }
  }) ?? null
}

/**
 * Teto de uma gravacao. A Meta aceita audio ate 16 MB; em AAC, dez minutos de
 * voz ficam em torno de 5 MB. Mais que isso e conversa para telefone.
 */
export const LIMITE_DA_GRAVACAO_S = 10 * 60

/** 7 -> "0:07"; 83 -> "1:23". */
export function tempoDeGravacao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** O nome do arquivo gravado: "audio-14h05.m4a". */
export function nomeDaGravacao(agora: Date, formato: FormatoDeGravacao): string {
  const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
  return `audio-${hora}.${formato.extensao}`
}
