/**
 * O robo pode responder nesta conversa? (07/11/2026, do sistema do Dr.
 * Marcello, onde nasceu em 23/10)
 *
 * Duas chaves: a da clinica (whatsapp_autoreply_enabled, no painel do menu
 * automatico) e a de cada conversa (robo_desligado_em, botao na conversa).
 * A da conversa veio porque desligar a clinica inteira para cuidar de uma
 * paciente calava o robo para todos os outros.
 */
export function roboRespondeNaConversa(p: { ligadoNaClinica: boolean | null | undefined; desligadoNaConversaEm: string | null | undefined }): boolean {
  if (!p.ligadoNaClinica) return false
  return !p.desligadoNaConversaEm
}
