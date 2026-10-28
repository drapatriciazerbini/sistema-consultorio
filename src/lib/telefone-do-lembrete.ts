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
