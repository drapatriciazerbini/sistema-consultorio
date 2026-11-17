import { mesmoTelefone } from '../../supabase/functions/_shared/telefone-br.ts'

/**
 * A conversa de WhatsApp de quem esta numa linha da Agenda (porte de
 * 17/11/2026 do sistema do Dr. Marcello; la, 10/11/2026).
 *
 * Pedido do Edu: um icone do WhatsApp em cada consulta que leve direto para a
 * conversa. Ate aqui, quem via "Lembrete enviado, sem resposta" na Agenda tinha
 * de ir em Conversas e procurar o paciente pelo nome.
 *
 * Primeiro o TELEFONE, depois o cadastro. O lembrete vai para um numero, e e
 * nessa conversa que a recepcao quer cair: um paciente pode ter duas conversas
 * (o celular dele e o da filha), e um casal de idosos divide a conversa da
 * filha, que so esta ligada ao cadastro de um dos dois. Pelo cadastro primeiro,
 * quem ficou sem vinculo nao acharia nada e o paciente com duas conversas
 * cairia na que nao recebeu o lembrete.
 *
 * O telefone e comparado em todas as grafias (55 do pais, nono digito): a Meta
 * ainda entrega celular antigo com 12 digitos, e o cadastro guarda 11.
 *
 * A lista vem da mais recente para a mais antiga, entao entre duas conversas do
 * mesmo paciente vence a que teve mensagem por ultimo.
 */
export interface ContatoDaAgenda {
  patientId: string | null
  /** O numero que recebe o lembrete (ver telefoneDoLembrete). */
  telefone: string
  /** So para a tela dizer de quem nao achou conversa. */
  nome: string
}

export function conversaDoContato<C extends { patientId: string | null; phoneDigits: string }>(
  conversas: readonly C[],
  contato: Pick<ContatoDaAgenda, 'patientId' | 'telefone'>,
): C | null {
  const digitos = String(contato.telefone ?? '').replace(/\D/g, '')
  // Com DDD: so o final do numero confundiria (11) e (13).
  if (digitos.length >= 10) {
    const peloTelefone = conversas.find((c) => c.phoneDigits && mesmoTelefone(c.phoneDigits, digitos))
    if (peloTelefone) return peloTelefone
  }
  if (contato.patientId) {
    return conversas.find((c) => c.patientId === contato.patientId) ?? null
  }
  return null
}

/** Da para procurar conversa? Sem cadastro e sem numero, o icone nem aparece. */
export function temComoAcharConversa(contato: Pick<ContatoDaAgenda, 'patientId' | 'telefone'>): boolean {
  return Boolean(contato.patientId) || String(contato.telefone ?? '').replace(/\D/g, '').length >= 10
}
