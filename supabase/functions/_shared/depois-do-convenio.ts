import { EXPEDIENTE } from './expediente.ts'

/**
 * "Sobre a Dra. Patricia" para quem perguntou convenio ou preco e sumiu
 * (07/11/2026, portado do sistema do Dr. Marcello, onde nasceu em 23/10).
 *
 * La, uma mae perguntou do convenio, ouviu que a consulta e particular e nao
 * escreveu mais nada. O Edu: "quando o cliente se cala por conta de nao atender
 * o convenio esperado ou pelo preco", mandar um texto sobre a formacao e a
 * experiencia do medico. O texto e a resposta pronta marcada para isso na tela
 * (bot_answers.after_price_silence); a regra de QUANDO mandar mora aqui,
 * coberta por testes, e a funcao agendada (depois-do-convenio) so le o banco,
 * pergunta e envia.
 *
 * Aqui o preco aparece de outro jeito: o robo da Dra. mostra o valor DENTRO do
 * pedido de consulta (etapas pedido_valor e visita_valor, com os botoes
 * "Entendi, seguir" e "Tenho duvida"), sem a pessoa ter perguntado. Quem para
 * ali nao deixou pergunta de preco no historico, entao a etapa e que avisa.
 *
 * Regras (as do sistema de origem, revistas la em 26/10/2026):
 * - o paciente perguntou de convenio ou preco, OU comecou o pedido de consulta
 *   e parou no meio (antes de aceitar o valor), e a ultima mensagem e NOSSA e
 *   automatica (nem o paciente nem a equipe escreveram depois);
 * - 6 horas de silencio desde a nossa resposta (era 30 minutos: o Edu achou
 *   cedo demais - "depois de 6 horas");
 * - so das 8h as 22h; o que vencer de madrugada sai as 8h, se a janela de 24h
 *   da Meta ainda estiver aberta;
 * - uma vez por conversa (quem ja recebeu, nao recebe de novo - a funcao
 *   confere no historico inteiro);
 * - conversa concluida, com a equipe, ou de quem pediu para sair: nao (a funcao
 *   filtra antes de perguntar aqui).
 *
 * E perto de fechar as 24h, o menu de novo (precisaDoMenuDeNovo): "se mesmo
 * assim o cliente nao retornar, ele envia em 23h o botao de menu novamente,
 * para nao perder as 24h".
 */

/** Silencio minimo depois da nossa resposta antes do "Sobre". */
export const SILENCIO_MS = 6 * 3600 * 1000

/** Margem antes das 24h da Meta: a mensagem ainda precisa chegar. */
const JANELA_MS = 23 * 3600 * 1000

/** Das 8h as 22h no relogio do consultorio. */
const HORA_INICIO = EXPEDIENTE.inicio
const HORA_FIM = 22

/**
 * As etapas do pedido antes de o valor ser aceito. Parar numa delas e
 * "comecou a pedir e nao terminou", e o valor (pedido_valor, visita_valor) e a
 * mais provavel. Nome e nascimento (pedido_nome, visita_nome...) ficam de
 * fora: ai a pessoa ja aceitou o valor, e o "Sobre a Dra." nao responde a
 * duvida dela. As aguardando_* sao do agendamento direto, que o robo ainda usa
 * em alguns caminhos.
 */
export const ETAPAS_DO_AGENDAMENTO: readonly string[] = [
  'aguardando_paciente',
  'aguardando_unidade',
  'aguardando_convenio',
  'aguardando_dia',
  'aguardando_horario',
  'pedido_tipo',
  'pedido_periodos',
  'pedido_restricao',
  'pedido_quando',
  'pedido_valor',
  'visita_endereco',
  'visita_restricao',
  'visita_valor',
]

export function parouNoAgendamento(etapa: string | null | undefined): boolean {
  return ETAPAS_DO_AGENDAMENTO.includes(String(etapa ?? ''))
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * A mensagem do paciente pergunta de convenio ou de preco? Larga de proposito:
 * o resto da regra (a nossa resposta foi a ultima, o silencio) e que segura o
 * envio. "plano" sozinho fica de fora ("plano de tratamento").
 */
export function perguntouConvenioOuPreco(texto: string | null | undefined): boolean {
  const t = ` ${semAcento(String(texto ?? '')).replace(/[^a-z0-9\s]/g, ' ')} `
  return (
    /\b(convenio|convenios|plano de saude|planos de saude|pelo plano|meu plano|aceita plano|unimed|amil|bradesco saude|sulamerica|sul america|hapvida|notredame|notre dame|porto seguro saude|cassi|geap|reembolso|particular)\b/.test(t) ||
    /\b(valor|valores|preco|precos|quanto custa|quanto e a consulta|quanto fica|quanto sai|quanto cobra|quanto ta|qual o valor|custa quanto|custo da consulta)\b/.test(t)
  )
}

export type MensagemDaConversa = {
  direction: 'inbound' | 'outbound' | string
  body: string | null
  automatic: boolean | null
  created_at: string
}

function horaNoConsultorio(agora: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: EXPEDIENTE.fuso, hour: '2-digit', hourCycle: 'h23' }).format(agora),
  )
}

/**
 * O que as duas regras pedem igual: a ultima mensagem e nossa, o paciente
 * perguntou de preco ou parou no agendamento, e so o robo ou a IA escreveram
 * depois dela. Devolve a hora da mensagem da familia e da nossa ultima, ou
 * null quando nao se aplica.
 */
function familiaSumiu(
  mensagens: readonly MensagemDaConversa[],
  etapa: string | null | undefined,
): { familiaEm: number; nossaEm: number; depois: readonly MensagemDaConversa[] } | null {
  const ultima = mensagens.at(-1)
  if (!ultima || ultima.direction !== 'outbound') return null

  const indiceDaFamilia = mensagens.map((m) => m.direction).lastIndexOf('inbound')
  if (indiceDaFamilia < 0) return null
  const daFamilia = mensagens[indiceDaFamilia]
  if (!perguntouConvenioOuPreco(daFamilia.body) && !parouNoAgendamento(etapa)) return null

  // Depois do paciente, so o robo ou a IA. Alguem da equipe escreveu: a
  // conversa e dela, e o texto automatico atropelaria.
  const depois = mensagens.slice(indiceDaFamilia + 1)
  if (depois.some((m) => m.direction === 'outbound' && m.automatic !== true)) return null

  const familiaEm = new Date(daFamilia.created_at).getTime()
  const nossaEm = new Date(ultima.created_at).getTime()
  if (Number.isNaN(familiaEm) || Number.isNaN(nossaEm)) return null
  return { familiaEm, nossaEm, depois }
}

function noHorario(agora: Date): boolean {
  const hora = horaNoConsultorio(agora)
  return hora >= HORA_INICIO && hora < HORA_FIM
}

/**
 * Manda o "Sobre" agora? `mensagens` em ordem de envio (a mais antiga
 * primeiro), as ultimas da conversa. `jaRecebeu` vem do historico inteiro (a
 * funcao procura o comeco do texto). `etapa` e a etapa do robo na conversa.
 */
export function precisaDoSobre(
  mensagens: readonly MensagemDaConversa[],
  agora: Date,
  jaRecebeu: boolean,
  etapa: string | null = null,
): boolean {
  if (jaRecebeu || !noHorario(agora)) return false
  const sumiu = familiaSumiu(mensagens, etapa)
  if (!sumiu) return false
  if (agora.getTime() - sumiu.nossaEm < SILENCIO_MS) return false
  return agora.getTime() - sumiu.familiaEm < JANELA_MS
}

/**
 * O menu de novo, antes de fechar a janela de 24h da Meta (26/10/2026).
 *
 * Depois disso, a clinica so fala com o paciente por modelo aprovado. O menu
 * vai uma vez, entre 22h e 23h45 depois da ultima mensagem do paciente, so das
 * 8h as 22h e com a nossa ultima mensagem parada ha pelo menos 2 horas (sem
 * isto, o "Sobre" que saiu atrasado de madrugada e o menu chegariam colados).
 */
export const MENU_DE_NOVO_DE_MS = 22 * 3600 * 1000
export const MENU_DE_NOVO_ATE_MS = (23 * 60 + 45) * 60 * 1000
const SILENCIO_ANTES_DO_MENU_MS = 2 * 3600 * 1000

/** O texto em cima do menu. O comeco dele marca quem ja recebeu nesta conversa. */
export const AVISO_DO_MENU =
  'Oi! Passando só para você não ficar sem resposta 😊 Se ainda quiser pedir a consulta ou tirar alguma dúvida, é só tocar em *Ver opções* 👇'

export function precisaDoMenuDeNovo(
  mensagens: readonly MensagemDaConversa[],
  agora: Date,
  etapa: string | null = null,
): boolean {
  if (!noHorario(agora)) return false
  const sumiu = familiaSumiu(mensagens, etapa)
  if (!sumiu) return false
  const marca = marcaDoTexto(AVISO_DO_MENU)
  if (sumiu.depois.some((m) => m.direction === 'outbound' && String(m.body ?? '').trim().startsWith(marca))) return false
  if (agora.getTime() - sumiu.nossaEm < SILENCIO_ANTES_DO_MENU_MS) return false
  const desdeAFamilia = agora.getTime() - sumiu.familiaEm
  return desdeAFamilia >= MENU_DE_NOVO_DE_MS && desdeAFamilia < MENU_DE_NOVO_ATE_MS
}

/** O comeco do texto, para achar no historico quem ja recebeu. */
export function marcaDoTexto(texto: string): string {
  return texto.trim().slice(0, 60)
}
