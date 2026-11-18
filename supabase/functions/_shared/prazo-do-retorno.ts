/**
 * Consulta e retorno: ate quando vale o retorno incluido (porte de 18/11/2026
 * do sistema do Dr. Marcello, onde a regra e de 26/10/2026).
 *
 * A regra: toda consulta da direito a UM retorno; o retorno nao abre outro. O
 * prazo nasce com 30 dias.
 *
 * O caso que trouxe a regra, na origem: consulta em 16/09 e retorno em 02/10.
 * O cabecalho da conversa contava 30 dias da ultima visita, fosse qual fosse:
 * a equipe disse a familia que o retorno ia ate 02/11, e a familia lembrou que
 * 02/10 ja tinha sido o retorno.
 *
 * Aqui, por enquanto, so a conta e o selo da conversa (ver PrazoDoRetorno em
 * Conversations.tsx). O prontuario da Dra. Patricia ainda nao marca "consulta"
 * ou "retorno" nem o "Retorno ate" (na origem sao as colunas
 * consultations.visita e retorno_ate): sem a marcacao, tudo sai da sequencia
 * de visitas. A primeira visita e consulta; a visita dentro do prazo de uma
 * consulta cujo retorno ainda nao foi usado e retorno; o resto e consulta.
 * Nada e gravado por essa conta: ela e refeita a cada leitura. Os campos
 * `visita` e `retornoAte` ficam na regra para o dia em que o prontuario
 * marcar, e ai a marcacao passa por cima da sequencia.
 *
 * Deduzido nao e confirmado: a tela mostra como conta a conferir, e o robo NAO
 * usa (ele nao fala de retorno incluido com o paciente por esta conta). A
 * agenda da Dra. e por pedido: o selo serve para a equipe saber o que dizer,
 * e nao para o robo oferecer horario.
 */

import { diaEmSaoPaulo } from './consulta-aconteceu.ts'

/** O prazo que o prontuario sugere: a medica muda quando quiser. */
export const DIAS_DO_RETORNO = 30

export type TipoDeVisita = 'consulta' | 'retorno'

export type Visita = {
  /** Dia do atendimento, AAAA-MM-DD. */
  data: string
  /** Marcado no prontuario. Nulo: atendimento de antes da regra. */
  visita?: TipoDeVisita | null
  /**
   * Ate quando vale o retorno desta consulta. Nulo: o padrao de 30 dias. O
   * proprio dia (ou antes) e "sem retorno".
   */
  retornoAte?: string | null
}

export type VisitaClassificada = {
  data: string
  tipo: TipoDeVisita
  /** Ate quando vale o retorno (so na consulta). Nulo: sem retorno. */
  ate: string | null
  /** Saiu da sequencia, e nao do prontuario: a tela mostra como sugestao. */
  sugerido: boolean
}

const DIA = /^\d{4}-\d{2}-\d{2}$/

function dia(valor: string | null | undefined): string | null {
  const v = String(valor ?? '').slice(0, 10)
  return DIA.test(v) ? v : null
}

/** AAAA-MM-DD + dias, ao meio-dia UTC (o fuso nao troca o dia). */
export function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

/** O "Retorno ate" que o prontuario oferece para uma consulta. */
export function retornoPadrao(data: string): string {
  return somarDias(data, DIAS_DO_RETORNO)
}

function prazoDaConsulta(data: string, retornoAte: string | null): string | null {
  const ate = retornoAte ?? retornoPadrao(data)
  // "Sem retorno" grava o proprio dia: nao sobra dia nenhum depois dele.
  return ate > data ? ate : null
}

/**
 * Cada visita como consulta ou retorno, em ordem de data. Duas fichas no mesmo
 * dia sao uma visita so (o esqueleto do cadastro e a ficha preenchida, por
 * exemplo); vale a marcacao que houver em qualquer uma.
 */
export function classificarVisitas(visitas: readonly Visita[]): VisitaClassificada[] {
  const porDia = new Map<string, { visita: TipoDeVisita | null; retornoAte: string | null }>()
  for (const v of visitas) {
    const d = dia(v.data)
    if (!d) continue
    const atual = porDia.get(d) ?? { visita: null, retornoAte: null }
    porDia.set(d, {
      visita: atual.visita ?? (v.visita === 'consulta' || v.visita === 'retorno' ? v.visita : null),
      retornoAte: atual.retornoAte ?? dia(v.retornoAte),
    })
  }

  const saida: VisitaClassificada[] = []
  // A consulta cujo retorno ainda pode ser usado.
  let aberta: { ate: string } | null = null
  for (const d of [...porDia.keys()].sort()) {
    const { visita, retornoAte } = porDia.get(d)!
    const tipo: TipoDeVisita = visita ?? (aberta && d <= aberta.ate ? 'retorno' : 'consulta')
    if (tipo === 'consulta') {
      const ate = prazoDaConsulta(d, retornoAte)
      saida.push({ data: d, tipo, ate, sugerido: !visita })
      aberta = ate ? { ate } : null
    } else {
      saida.push({ data: d, tipo, ate: null, sugerido: !visita })
      // Retorno usado: o proximo e consulta ("pode uma vez").
      aberta = null
    }
  }
  return saida
}

/**
 * `confirmado`: as visitas que decidem estao marcadas no prontuario, e nao
 * deduzidas. So o confirmado valeria para o robo falar com o paciente (ver
 * situacaoDoRetorno).
 */
export type SituacaoDoRetorno = { confirmado: boolean } & (
  /** Ainda da para marcar o retorno, ate `ate`. */
  | { tipo: 'aberto'; consulta: string; ate: string }
  /** O retorno da ultima consulta ja aconteceu: a proxima e consulta. */
  | { tipo: 'usado'; consulta: string; usadoEm: string }
  /** Passou do prazo sem retorno. */
  | { tipo: 'vencido'; consulta: string; ate: string }
  /** A medica marcou "sem retorno". */
  | { tipo: 'sem'; consulta: string }
)

/**
 * Onde o paciente esta hoje. `visitas` sao os atendimentos que ja aconteceram
 * (os de depois de hoje sao ignorados). Nulo: nunca veio.
 *
 * Deduzido nao e confirmado (26/10/2026, na origem). Nos atendimentos de
 * antes da regra havia pacientes com tres registros em dez dias e nenhum
 * horario na agenda (um exame lido, um recado?): a sequencia pode chamar de
 * consulta o que era o retorno, e o robo diria "retorno incluido" a quem deve
 * uma consulta. A tela mostra o deduzido como conta a conferir; o robo so
 * poderia usar o confirmado.
 */
export function situacaoDoRetorno(visitas: readonly Visita[], hoje: string): SituacaoDoRetorno | null {
  const ate = hoje.slice(0, 10)
  const feitas = classificarVisitas(visitas.filter((v) => (dia(v.data) ?? '9999') <= ate))
  const ultimaConsulta = [...feitas].reverse().find((v) => v.tipo === 'consulta')
  if (!ultimaConsulta) return null
  const retorno = feitas.find((v) => v.tipo === 'retorno' && v.data > ultimaConsulta.data)
  const confirmado = !ultimaConsulta.sugerido
  if (retorno) return { tipo: 'usado', consulta: ultimaConsulta.data, usadoEm: retorno.data, confirmado: confirmado && !retorno.sugerido }
  if (!ultimaConsulta.ate) return { tipo: 'sem', consulta: ultimaConsulta.data, confirmado }
  if (ultimaConsulta.ate < ate) return { tipo: 'vencido', consulta: ultimaConsulta.data, ate: ultimaConsulta.ate, confirmado }
  return { tipo: 'aberto', consulta: ultimaConsulta.data, ate: ultimaConsulta.ate, confirmado }
}

/**
 * O que o prontuario sugere para um atendimento novo no dia `data`, olhando as
 * outras visitas do paciente: retorno, se havia uma consulta com o retorno
 * ainda aberto naquele dia; consulta, no resto.
 */
export function sugestaoDeVisita(outras: readonly Visita[], data: string): { tipo: TipoDeVisita; consulta: string | null; ate: string | null } {
  const d = dia(data)
  if (!d) return { tipo: 'consulta', consulta: null, ate: null }
  const antes = outras.filter((v) => (dia(v.data) ?? '9999') < d)
  const situacao = situacaoDoRetorno(antes, d)
  return situacao?.tipo === 'aberto'
    ? { tipo: 'retorno', consulta: situacao.consulta, ate: situacao.ate }
    : { tipo: 'consulta', consulta: situacao?.consulta ?? null, ate: null }
}

/** Linha de consultations como o banco devolve (as colunas novas podem faltar). */
export type FichaDoBanco = { consultation_date: string; visita?: string | null; retorno_ate?: string | null }

/**
 * As visitas de um paciente a partir do banco: os atendimentos do prontuario e
 * os horarios da agenda que ja passaram sem cancelamento nem falta. A agenda
 * entra porque a medica pode assinar dias depois, e ate la a visita so existe
 * nela; no mesmo dia, as duas viram uma visita so (ver classificarVisitas).
 *
 * Retorno marcado no prontuario sem horario na agenda naquele dia nao e visita
 * (11/11/2026, na origem): um atendimento aberto so para receitar, num
 * feriado, saiu como "Retorno" pela sugestao da tela, e o robo disse a familia
 * que o retorno da consulta "ja foi feito". O que nao passou pela agenda nao
 * gasta o retorno do paciente.
 */
export function visitasDoBanco(fichas: readonly FichaDoBanco[], agendaQuePassou: readonly { starts_at: string }[]): Visita[] {
  const diasDaAgenda = new Set(agendaQuePassou.map((h) => diaEmSaoPaulo(h.starts_at)))
  return [
    ...fichas.filter((f) => f.visita !== 'retorno' || diasDaAgenda.has(String(f.consultation_date).slice(0, 10))).map((f) => ({
      data: f.consultation_date,
      visita: f.visita === 'consulta' || f.visita === 'retorno' ? f.visita : null,
      retornoAte: f.retorno_ate ?? null,
    })),
    ...agendaQuePassou.map((h) => ({ data: diaEmSaoPaulo(h.starts_at) })),
  ]
}
