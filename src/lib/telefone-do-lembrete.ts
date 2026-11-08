/**
 * Para que telefone vai o lembrete da vespera, visto da Agenda.
 *
 * A mesma regra do appointment-reminders: o telefone do cadastro do paciente
 * e, sem ele, o de quem marcou a consulta.
 *
 * Ate aqui a Agenda so olhava o cadastro, e o cadastro vinha da lista de
 * pacientes carregada quando a tela abriu. No sistema do Dr. Marcello, em
 * 21/10/2026, uma paciente marcou pelo WhatsApp, o robo criou o cadastro com o
 * telefone, e a Agenda - aberta antes - nao achou a paciente na lista e mostrou
 * "Sem telefone: nao recebe lembrete" para quem tinha acabado de escrever. O
 * mesmo vale para o cadastro sem telefone de um idoso que marcou pelo celular
 * da filha: o lembrete vai para o contato, e a etiqueta nao pode dizer o
 * contrario.
 *
 * Vazio significa uma coisa so: essa pessoa nao vai receber lembrete nenhum, e
 * a tela precisa dizer isso antes da vespera, e nao depois da falta.
 */
export function telefoneDoLembrete(
  consulta: { patientId: string | null; contactPhone: string | null },
  pacientes: readonly { id: string; telefone?: string | null }[],
): string {
  const doCadastro = consulta.patientId
    ? (pacientes.find((p) => p.id === consulta.patientId)?.telefone ?? '').trim()
    : ''
  return doCadastro || (consulta.contactPhone ?? '').trim()
}

/**
 * O WhatsApp digitado na agenda e um numero que existe? Devolve o problema em
 * texto para a recepcao, ou null se esta certo ou vazio (07/11/2026, portado do
 * sistema do Dr. Marcello).
 *
 * La, em 29/10, uma consulta entrou na agenda com o celular da familia e mais
 * dois digitos no fim: 13 numeros. O sistema aceitou, o lembrete da vespera e
 * a mensagem da equipe voltaram "Message undeliverable", e o cadastro
 * automatico da vespera nasceu repetido, porque o numero nao batia com o da
 * ficha que ja existia.
 *
 * Vazio passa: a agenda ja avisa que sem WhatsApp nao sai lembrete. O 55 do
 * pais pode vir ou nao; tirado ele, sobram DDD + 8 (fixo, ou celular antigo
 * que ganha o 9 no envio) ou DDD + 9 comecando por 9.
 */
export function problemaNoWhatsapp(numero: string | null | undefined): string | null {
  const digitos = String(numero ?? '').replace(/\D/g, '')
  if (!digitos) return null
  const semPais = digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos
  if (semPais.length !== 10 && semPais.length !== 11) {
    return `Esse WhatsApp tem ${semPais.length} números. Com o DDD, celular tem 11 (ou 10 sem o 9). Confira antes de marcar.`
  }
  if (!/^[1-9][1-9]/.test(semPais)) return 'O DDD desse WhatsApp não existe. Confira antes de marcar.'
  if (semPais.length === 11 && semPais[2] !== '9') {
    return 'Celular com 11 números começa por 9 depois do DDD. Confira antes de marcar.'
  }
  return null
}
