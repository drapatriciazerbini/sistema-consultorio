/**
 * Esta pessoa ja leu quanto custa a consulta? (27/10/2026)
 *
 * Separado da tela para poder ser testado. Nasceu de um caso de 19/10/2026: um
 * paciente pediu consulta pelo robo, a equipe confirmou o horario a mao e ninguem
 * falou de valor nem de particular. Ele foi atendido achando que era pelo plano
 * e saiu sem pagar, e a Dra. Patricia so percebeu no fim da consulta. O sistema
 * tinha a resposta pronta de valor o tempo todo; faltava alguem lembrar de
 * mandar. Agora a Central lembra.
 *
 * A regra olha so o que SAIU (robo ou equipe), e aceita tres sinais: um preco
 * escrito ("R$"), o aviso de particular que o robo manda desde 27/10, ou o
 * comeco da propria resposta pronta de valor. Errar para o lado de avisar e
 * barato - a equipe ignora um aviso; errar para o lado de calar e repetir o caso.
 */

export type MensagemParaValor = {
  direction: 'inbound' | 'outbound'
  body: string
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** A resposta pronta de valor, pelo assunto ("Valor e pagamento"). */
export function respostaDeValor<T extends { assunto: string; resposta: string }>(prontas: T[]): T | null {
  return prontas.find((p) => /\bvalor/.test(normalizar(p.assunto))) ?? null
}

export function valoresJaEnviados(mensagens: MensagemParaValor[], textoDoValor?: string | null): boolean {
  // O comeco da resposta pronta basta para reconhecer que ela foi enviada,
  // mesmo que a equipe tenha mexido no fim antes de mandar.
  const trecho = textoDoValor ? normalizar(textoDoValor).slice(0, 40) : ''
  return mensagens.some((m) => {
    if (m.direction !== 'outbound' || !m.body) return false
    const corpo = normalizar(m.body)
    return (
      corpo.includes('r$') ||
      corpo.includes('consulta e particular') ||
      corpo.includes('consulta em casa e particular') ||
      (trecho.length >= 20 && corpo.includes(trecho))
    )
  })
}
