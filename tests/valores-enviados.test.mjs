// Aviso "esta pessoa ainda nao recebeu os valores" na Central (27/10/2026).
// Caso de 19/10/2026: um paciente marcou, foi atendido e ninguem tinha falado
// de valor. A conversa abaixo e inventada, no mesmo formato.
import assert from 'node:assert/strict'
import { respostaDeValor, valoresJaEnviados } from './valores-enviados.build.mjs'

const VALOR = 'A consulta particular custa R$ 450,00. Aceitamos pix e cartão.'
const sai = (body) => ({ direction: 'outbound', body })
const entra = (body) => ({ direction: 'inbound', body })

let passou = 0
const confere = (nome, fn) => {
  fn()
  passou++
  console.log(`ok - ${nome}`)
}

// Pedido pelo robo, horario combinado a mao, e nada do que saiu fala de valor.
const SEM_VALOR = [
  entra('Olá! Gostaria de informações sobre uma consulta.'),
  sai('Olá! 👋 Aqui é o consultório da Dra. Patrícia Zerbini.'),
  sai('✅ *Pedido de consulta anotado.*'),
  entra('Bom dia quero marcar uma consulta com um clínico geral'),
  sai('No consultório a próxima vaga é dia 10 às 15 hrs.'),
  entra('Pode ser'),
  sai('Marcado, Sr José. Obrigada'),
]

confere('conversa sem valor pede o aviso', () => assert.equal(valoresJaEnviados(SEM_VALOR, VALOR), false))
confere('resposta pronta de valor enviada tira o aviso', () =>
  assert.equal(valoresJaEnviados([...SEM_VALOR, sai(VALOR)], VALOR), true))
confere('preço escrito a mão também conta', () =>
  assert.equal(valoresJaEnviados([...SEM_VALOR, sai('O valor é R$450')], VALOR), true))
confere('aviso de particular do robô conta', () =>
  assert.equal(valoresJaEnviados([sai('💳 *A consulta é particular*, sem convênio.')], null), true))
confere('a pessoa perguntar o preço não conta como enviado', () =>
  assert.equal(valoresJaEnviados([entra('quanto custa? é R$ quanto?')], VALOR), false))
confere('acha a resposta de valor pelo assunto', () =>
  assert.equal(respostaDeValor([{ assunto: 'Convênios', resposta: 'x' }, { assunto: 'Valor e pagamento', resposta: VALOR }])?.resposta, VALOR))

console.log(`\nvalores-enviados: ${passou} verificações`)
