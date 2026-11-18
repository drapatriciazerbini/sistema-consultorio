/**
 * Reacao da equipe a uma mensagem do paciente (porte de 18/11/2026, do sistema
 * do Dr. Marcello, la desde 13/11/2026).
 *
 * O pedido de la: quem escreveu respondeu "Sim, entendi", e a equipe queria
 * dar um joinha em vez de escrever outra mensagem. Aqui e a filha ou o
 * cuidador que responde "combinado" ao recado da Dra. Patricia. A API da Meta
 * aceita reacao (type "reaction"); o que ela NAO aceita e editar ou apagar o
 * que ja foi enviado.
 *
 * Lista fechada, de proposito: a reacao sai em nome do consultorio, e uma
 * lista curta impede o emoji errado num clique apressado. Sao as mesmas seis
 * do WhatsApp, com as maos postas no lugar que a recepcao mais usa.
 *
 * A reacao nao e mensagem: nao entra no historico como linha, nao cala o robo
 * pela regra das 12h e nao tira a conversa de "precisa de atencao". Reagir nao
 * e responder.
 *
 * Sem import: o teste roda direto no Node (tests/reacao.test.mjs).
 */

export const REACOES = ['👍', '❤️', '🙏', '😊', '😂', '😮', '😢'] as const

/**
 * O emoji que vai para a Meta. Vazio tira a reacao (e assim que a Meta pede).
 * Nulo: nao e uma reacao aceita, e nada e enviado.
 */
export function reacaoValida(emoji: unknown): string | null {
  if (typeof emoji !== 'string') return null
  const limpo = emoji.trim()
  if (!limpo) return ''
  return (REACOES as readonly string[]).includes(limpo) ? limpo : null
}

/** Por que nao da para reagir a esta mensagem. Nulo: da. */
export function recusaDaReacao(
  mensagem: { direction?: string | null; external_message_id?: string | null } | null,
): string | null {
  if (!mensagem) return 'Esta mensagem não é desta conversa.'
  // So as recebidas: reagir a propria mensagem confunde quem le a conversa.
  if (mensagem.direction !== 'inbound') return 'Só dá para reagir às mensagens que o paciente mandou.'
  // Sem o numero da Meta nao ha a que reagir (mensagem anterior a gravacao do id).
  if (!String(mensagem.external_message_id ?? '').trim()) {
    return 'Esta mensagem é antiga demais: o WhatsApp não guardou o número dela, então não dá para reagir.'
  }
  return null
}

/** O pedaco do pedido a Meta que diz "reacao". */
export function conteudoDaReacao(externo: string, emoji: string) {
  return { type: 'reaction', reaction: { message_id: externo, emoji } }
}

/** A reacao que fica depois do clique: tocar na que ja esta tira. */
export function proximaReacao(atual: string | null | undefined, clicada: string): string {
  return (atual ?? '') === clicada ? '' : clicada
}
