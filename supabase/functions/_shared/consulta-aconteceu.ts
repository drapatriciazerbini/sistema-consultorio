/**
 * A consulta do acompanhamento aconteceu?
 *
 * Quem marca pelo robo ganha ficha na hora, e a ficha cria sozinha uma
 * consulta vazia com a data do agendamento - e dela que penduram os
 * acompanhamentos de 15, 30 e 90 dias. No sistema do Dr. Marcello (23/10/2026)
 * um paciente marcou para 23/09, nao veio, e no dia 23/10 a familia recebeu
 * "como ele esta depois da consulta do dia 23/09?". No banco de la, 12
 * acompanhamentos ja tinham saido assim, quase todos para quem cancelou ou
 * faltou. Aqui o caminho e o mesmo, e para um idoso que nao veio (ou para a
 * filha que desmarcou) a pergunta soa como descuido.
 *
 * O envio automatico so manda quando ha sinal de que o paciente foi atendido:
 *  - prontuario escrito na consulta;
 *  - ou presenca ("Chegou") na agenda daquele dia;
 *  - ou nenhuma consulta na agenda daquele dia: e a ficha cadastrada a mao
 *    pela equipe depois do atendimento, o uso de antes do robo.
 * Agenda do dia so com cancelada, falta ou ainda "marcada": nao manda.
 *
 * Os quatro campos sao os mesmos que a falta automatica das 3h usa para
 * decidir "teve prontuario, entao veio" (20260930120000).
 */

export type ConsultaDoAcompanhamento = {
  chief_complaint?: string | null
  clinical_history?: string | null
  assessment?: string | null
  plan?: string | null
}

/** Texto do editor sem as marcas: "<p></p>" e prontuario vazio. */
function semMarcas(campo: string | null | undefined): string {
  return (campo ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export function temProntuario(c: ConsultaDoAcompanhamento): boolean {
  return [c.chief_complaint, c.clinical_history, c.assessment, c.plan].some((campo) => Boolean(semMarcas(campo)))
}

export function consultaAconteceu(c: ConsultaDoAcompanhamento, statusDaAgendaNoDia: string[]): boolean {
  if (temProntuario(c)) return true
  if (statusDaAgendaNoDia.includes('attended')) return true
  return statusDaAgendaNoDia.length === 0
}

/** O dia da consulta no relogio da clinica (a agenda guarda em UTC). */
export function diaEmSaoPaulo(instante: string): string {
  return new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export type ConsultaDaAgenda = ConsultaDoAcompanhamento & { id: string; clinic_id: string; patient_id: string; consultation_date: string }
export type HorarioDaAgenda = { patient_id: string; clinic_id: string; starts_at: string; status: string }

/**
 * As consultas sem sinal de atendimento, entre as dadas. Usado pelo envio
 * automatico (segura o acompanhamento) e pela tela de Acompanhamentos (mostra
 * que ele nao vai sair sozinho) - a mesma regra nos dois, para a tela nunca
 * prometer um envio que o servidor vai segurar.
 */
export function consultasQueNaoAconteceram(consultas: ConsultaDaAgenda[], agenda: HorarioDaAgenda[]): Set<string> {
  const fora = new Set<string>()
  for (const c of consultas) {
    const doDia = agenda
      .filter((a) => a.patient_id === c.patient_id && a.clinic_id === c.clinic_id && diaEmSaoPaulo(a.starts_at) === c.consultation_date)
      .map((a) => a.status)
    if (!consultaAconteceu(c, doDia)) fora.add(c.id)
  }
  return fora
}
