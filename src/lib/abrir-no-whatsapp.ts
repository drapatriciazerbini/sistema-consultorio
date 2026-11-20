/**
 * "Abrir no meu WhatsApp" (porte de 20/11/2026 do sistema do Dr. Marcello,
 * onde entrou em 17/11).
 *
 * La, o Dr. Marcello as vezes queria chamar a familia do proprio celular, e
 * para isso tinha que salvar o contato ou digitar o numero. O endereco wa.me
 * abre a conversa direto, sem salvar ninguem; a tela mostra esse endereco como
 * QR code para a camera do celular. Aqui serve tambem para o celular do
 * consultorio: com o numero em coexistencia, a camera dele abre a conversa no
 * WhatsApp Business, e o que for escrito ali aparece na Central.
 *
 * Sem texto pronto no endereco: a conversa abre vazia e quem escreve e a
 * pessoa da equipe.
 */
export function linkDoWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  // Com DDI: 55 + DDD + 8 ou 9 digitos. Sem DDI: DDD + 8 ou 9 digitos.
  // Qualquer outra coisa (ramal, numero cortado) nao vira endereco: um QR que
  // abre a conversa de um desconhecido e pior que QR nenhum.
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return `https://wa.me/${digitos}`
  if (digitos.length === 10 || digitos.length === 11) return `https://wa.me/55${digitos}`
  return null
}

/** Os digitos nacionais (DDD + numero), para copiar e para mostrar na tela. */
export function numeroNacional(telefone: string | null | undefined): string {
  const link = linkDoWhatsApp(telefone)
  return link ? link.slice('https://wa.me/55'.length) : ''
}
