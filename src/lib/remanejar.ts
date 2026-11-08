/**
 * Remanejar uma consulta pela Agenda (07/11/2026, portado do sistema do Dr.
 * Marcello, onde nasceu em 28/10).
 *
 * Ate aqui a unica forma de mudar o dia de uma consulta era cancelar e marcar
 * de novo. E cancelar manda "sua consulta foi cancelada" para o paciente, a nao
 * ser que a recepcao lembre de escolher a correcao interna. O pedido do Edu, la,
 * ao trazer uma consulta de 06/11 para o proprio dia: "quero poder remanejar
 * sem o paciente receber que cancelou". Aqui vale o mesmo.
 *
 * Muda a PROPRIA consulta, em vez de criar outra: a ficha respondida no
 * WhatsApp, o convenio e a conversa de origem continuam nela, e o gatilho
 * acompanhamento_segue_a_agenda (25/10/2026) leva a consulta vazia do
 * prontuario, e com ela os acompanhamentos, para o dia novo. O robo faz
 * diferente (cria outra e cancela a antiga) porque o paciente pode desistir no
 * meio da escolha; aqui quem escolhe e a equipe, de uma vez so.
 *
 * Ninguem e avisado. Quem remaneja combinou com o paciente ou a familia, ou vai
 * combinar.
 *
 * Visita em casa fica de fora (a Agenda nem mostra o botao): ela ocupa a agenda
 * de todas as unidades, com margem de deslocamento e duracao propria, e mudar o
 * dia dela e marcar outra visita pelo painel do domicilio.
 */

const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

export interface ConsultaOcupada {
  id: string
  startsAt: string
  endsAt: string
  status: string
  patientName?: string | null
}

/** Quanto a consulta dura hoje. Sem fim valido, a duracao padrao da agenda. */
export function duracaoEmMinutos(consulta: { startsAt: string; endsAt: string }, padrao: number): number {
  const minutos = (new Date(consulta.endsAt).getTime() - new Date(consulta.startsAt).getTime()) / 60000
  return Number.isFinite(minutos) && minutos > 0 ? Math.round(minutos) : padrao
}

/**
 * "2026-10-28" + "17:20" no relogio de Sao Paulo, para o encaixe digitado.
 *
 * O -03:00 fixo vale porque o Brasil nao tem horario de verao desde 2019; e
 * tambem o que o simulador da agenda usa.
 */
export function instanteEmSaoPaulo(dia: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return null
  const instante = new Date(`${dia}T${hora}:00-03:00`)
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString()
}

/**
 * Por que a consulta nao pode ir para esse horario. Nulo quando pode.
 *
 * O banco so recusa dois pacientes que comecam no MESMO minuto da mesma
 * unidade. Um encaixe as 10:20 em cima de uma consulta das 10:00 passaria, e o
 * a Dra. teria dois pacientes ao mesmo tempo. Por isso o choque e conferido
 * aqui pelo intervalo inteiro, como faz o available_slots - inclusive contra
 * as reservas sem paciente e as visitas em casa de outras unidades (a Agenda
 * carrega as duas junto), que tambem ocupam o horario.
 */
export function impedimentoDoRemanejamento(
  consulta: { id: string; startsAt: string },
  novoInicio: string | null,
  duracao: number,
  ocupadas: readonly ConsultaOcupada[],
  agora: Date,
): string | null {
  const inicio = novoInicio ? new Date(novoInicio).getTime() : Number.NaN
  if (Number.isNaN(inicio)) return 'Escolha o novo horário.'
  if (inicio === new Date(consulta.startsAt).getTime()) return 'A consulta já está nesse horário.'
  if (inicio < agora.getTime()) return 'Esse horário já passou.'
  const fim = inicio + duracao * 60000
  // A propria consulta fica de fora: mover das 10:00 para as 10:20 do mesmo
  // dia nao e choque com ela mesma.
  const choque = ocupadas.find(
    (outra) =>
      outra.id !== consulta.id &&
      outra.status !== 'cancelled' &&
      new Date(outra.startsAt).getTime() < fim &&
      new Date(outra.endsAt).getTime() > inicio,
  )
  if (choque) {
    return `Esse horário bate com ${choque.patientName?.trim() || 'uma reserva'} às ${HORA.format(new Date(choque.startsAt))}.`
  }
  return null
}

const DIA_SP = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

/**
 * Por que o encaixe (horario digitado, fora da grade) nao pode. Nulo quando pode.
 *
 * Regra do Edu (29/10/2026, no sistema do Dr. Marcello): la a equipe ofereceu
 * um horario que a agenda nao tinha e levou o paciente para as 17h30, depois do
 * ultimo horario; enquanto isso outra pessoa marcou as 17h20 pelo robo, e os
 * dois pacientes se encontraram na sala de espera. Encaixe, so com autorizacao
 * da Dra. Patricia e no fim do dia: comecando quando acaba o ultimo horario
 * daquele dia (livre ou marcado), para nao atrasar ninguem que ja esta na
 * agenda.
 *
 * `livres`: inicio dos horarios livres do dia escolhido. `ocupadas`: as
 * consultas futuras da unidade (a Agenda carrega todas). Dia sem nenhum
 * horario nao tem "fim do dia": encaixe ali seria abrir agenda, e isso e com
 * a Dra. pela propria agenda.
 */
export function impedimentoDoEncaixe(
  consulta: { id: string },
  novoInicio: string,
  dia: string,
  duracao: number,
  livres: readonly string[],
  ocupadas: readonly ConsultaOcupada[],
  autorizado: boolean,
): string | null {
  if (!autorizado) return 'Encaixe só com autorização da Dra. Patrícia: marque que ela autorizou.'
  const doDia = (iso: string) => DIA_SP.format(new Date(iso)) === dia
  let fimDoDia = Number.NEGATIVE_INFINITY
  for (const inicio of livres) {
    if (doDia(inicio)) fimDoDia = Math.max(fimDoDia, new Date(inicio).getTime() + duracao * 60000)
  }
  for (const outra of ocupadas) {
    if (outra.id === consulta.id || outra.status === 'cancelled' || !doDia(outra.startsAt)) continue
    fimDoDia = Math.max(fimDoDia, new Date(outra.endsAt).getTime())
  }
  if (!Number.isFinite(fimDoDia)) return 'Esse dia não tem agenda. Encaixe só no fim de um dia de atendimento.'
  if (new Date(novoInicio).getTime() < fimDoDia) {
    return `Encaixe só no fim do dia: a partir de ${HORA.format(new Date(fimDoDia))}, quando acaba o último horário.`
  }
  return null
}

/** O que muda na linha da consulta. */
export function camposDoRemanejamento(
  consulta: { rescheduleCount?: number | null },
  novoInicio: string,
  duracao: number,
) {
  const inicio = new Date(novoInicio)
  return {
    starts_at: inicio.toISOString(),
    ends_at: new Date(inicio.getTime() + duracao * 60000).toISOString(),
    // O lembrete e a resposta a ele eram do horario antigo. Sem zerar, quem ja
    // recebeu o lembrete nao recebe o do dia novo (o disparo so procura
    // reminder_sent_at vazio), e a Agenda mostraria "confirmou presenca" para
    // um horario que o paciente nunca confirmou.
    reminder_sent_at: null,
    reminder_failed_at: null,
    reminder_failure_reason: null,
    confirmed_at: null,
    // O pedido de remarcar foi atendido; sem isto a consulta continuaria na
    // lista "ligar hoje" com a etiqueta laranja.
    reschedule_requested_at: null,
    // A mesma conta do robo: e a etiqueta "Remarcada Nx" do cartao.
    reschedule_count: (consulta.rescheduleCount ?? 0) + 1,
  }
}
