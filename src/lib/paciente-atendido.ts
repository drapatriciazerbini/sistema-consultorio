import { diaEmSaoPaulo } from '../../supabase/functions/_shared/consulta-aconteceu.ts'

/**
 * Quem ja foi atendido, e quem so marcou.
 *
 * A ficha de quem marca pelo robo nasce na hora do agendamento. Ate aqui ela
 * entrava na lista de Pacientes, no painel e no acompanhamento como se o
 * paciente ja tivesse passado pela Dra. Patricia. No sistema do Dr. Marcello
 * (25/10/2026) eram 9 pacientes que nunca vieram, e o Edu pediu duas listas,
 * "atendidos" e "pre-agendados", com o painel contando so os atendidos. Aqui o
 * robo marca do mesmo jeito, e a filha que desmarca a consulta do pai deixaria
 * um "paciente" que a doutora nunca viu.
 *
 * Atendido e quem tem sinal de que veio:
 *  - presenca ("Chegou") em algum horario da agenda ligado a ficha;
 *  - ou prontuario escrito (so a medica enxerga; a recepcao fica com os outros
 *    dois sinais, e o prontuario ja marca a presenca sozinho);
 *  - ou a data da consulta ja passou e a agenda nao tem horario dele naquele
 *    dia: e a ficha cadastrada a mao depois do atendimento, o uso de antes do
 *    robo, ou consulta marcada pelo nome, sem ligar a ficha.
 * O resto e pre-agendado: marcou e ainda nao veio, ou cancelou, ou faltou.
 */
export type HorarioDoPaciente = { patientId: string; startsAt: string; status: string }

export function pacientesAtendidos(
  pacientes: readonly { id: string; dataConsulta: string }[],
  agenda: readonly HorarioDoPaciente[],
  comProntuario: ReadonlySet<string>,
  hoje: string,
): Set<string> {
  const atendidos = new Set<string>()
  const diasNaAgenda = new Map<string, Set<string>>()
  for (const horario of agenda) {
    if (horario.status === 'attended') atendidos.add(horario.patientId)
    const dias = diasNaAgenda.get(horario.patientId) ?? new Set<string>()
    dias.add(diaEmSaoPaulo(horario.startsAt))
    diasNaAgenda.set(horario.patientId, dias)
  }
  for (const paciente of pacientes) {
    if (comProntuario.has(paciente.id)) atendidos.add(paciente.id)
    const dia = paciente.dataConsulta
    if (dia && dia <= hoje && !diasNaAgenda.get(paciente.id)?.has(dia)) atendidos.add(paciente.id)
  }
  return atendidos
}
