/**
 * O que a faixa de confirmacao da conversa diz sobre a consulta (07/11/2026,
 * do sistema do Dr. Marcello).
 *
 * Saiu do FaixaDaConsulta para ter teste. O motivo: la, em 03/11, o lembrete de uma
 * consulta foi duas vezes para um numero que nao existe, voltou "Message
 * undeliverable" nas duas, e a faixa dizia "lembrete ainda nao enviado" - a
 * contagem so olhava os envios aceitos pela Meta. Parecia que o sistema ainda
 * ia mandar; na verdade ja tinha tentado e falhado. Falha tem que aparecer.
 */

export type SituacaoDaConfirmacao = {
  texto: string
  /** ok: confirmada; erro: pediu remarcar ou o lembrete nao chega; espera: o resto. */
  tom: 'ok' | 'erro' | 'espera'
}

const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

/**
 * A consulta e depois de amanha ou mais longe? Ai o lembrete ainda nao saiu
 * porque nao era para sair: ele vai na vespera. "Ainda nao enviado" numa
 * consulta de daqui a duas semanas pareceria defeito.
 */
function lembreteAindaVaiSair(iso: string, agora: Date) {
  const amanha = new Date(agora.getTime() + 24 * 3600 * 1000)
  return DIA_EM_SAO_PAULO.format(new Date(iso)) > DIA_EM_SAO_PAULO.format(amanha)
}

export function situacaoDaConfirmacao(
  consulta: {
    startsAt: string
    confirmada: boolean
    pediuRemarcar: boolean
    lembretes: number
    falhas: number
    motivoDaFalha: string | null
  },
  agora = new Date(),
): SituacaoDaConfirmacao {
  if (consulta.confirmada) return { texto: 'presença confirmada', tom: 'ok' }
  if (consulta.pediuRemarcar) return { texto: 'pediu para remarcar', tom: 'erro' }
  if (consulta.lembretes > 0) {
    const vezes = `${consulta.lembretes} ${consulta.lembretes === 1 ? 'vez' : 'vezes'}`
    return { texto: `sem resposta ao lembrete (enviado ${vezes})`, tom: 'espera' }
  }
  if (consulta.falhas > 0) {
    const vezes = `${consulta.falhas} ${consulta.falhas === 1 ? 'vez' : 'vezes'}`
    const motivo = consulta.motivoDaFalha ? ` (${consulta.motivoDaFalha})` : ''
    return {
      texto: `o lembrete não chegou: falhou ${vezes}${motivo}. Confira o telefone`,
      tom: 'erro',
    }
  }
  if (lembreteAindaVaiSair(consulta.startsAt, agora)) return { texto: 'o lembrete sai na véspera', tom: 'espera' }
  return { texto: 'lembrete ainda não enviado', tom: 'espera' }
}
