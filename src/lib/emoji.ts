/**
 * Emoji na caixa de resposta da conversa (13/11/2026).
 *
 * Pedido do Edu: "e possivel enviar emojis?". A caixa sempre aceitou (tecla
 * Windows + ponto), mas ninguem na recepcao conhecia o atalho. O botao mostra
 * os que o atendimento usa de verdade; o resto continua pelo teclado.
 */

export const EMOJIS_DA_RESPOSTA = [
  '😊', '🙂', '😉', '😄', '😂', '🥰', '😍', '🤗',
  '🙏', '👍', '👏', '👋', '🤝', '💪', '✌️', '👌',
  '❤️', '💙', '💚', '✨', '🌟', '🎉', '🌷', '☀️',
  // A linha das pessoas, trocada para a geriatria (20/11/2026): no sistema do
  // Dr. Marcello eram criancas. Aqui sao os pacientes e a visita em casa.
  '👵', '👴', '🧓', '🏠', '👩‍⚕️', '👨‍⚕️', '🩺', '💊',
  '📅', '⏰', '📍', '📞', '📎', '📋', '✅', '⚠️',
] as const

/**
 * Poe o emoji onde o cursor esta (ou no lugar do trecho selecionado) e diz
 * onde o cursor fica depois. Sem posicao conhecida, vai para o fim. Se o
 * limite da mensagem estouraria, nada muda: emoji cortado ao meio vira "?".
 */
export function inserirNoCursor(
  texto: string,
  inicio: number | null | undefined,
  fim: number | null | undefined,
  emoji: string,
  limite = 4096,
): { texto: string; cursor: number } {
  const de = Math.max(0, Math.min(inicio ?? texto.length, texto.length))
  const ate = Math.max(de, Math.min(fim ?? de, texto.length))
  const novo = texto.slice(0, de) + emoji + texto.slice(ate)
  if (novo.length > limite) return { texto, cursor: ate }
  return { texto: novo, cursor: de + emoji.length }
}
