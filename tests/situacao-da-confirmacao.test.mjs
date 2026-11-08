// Faixa de confirmacao da conversa (03/11/2026): lembrete que falhou aparece
// como falha, nao como "ainda nao enviado". Dados inventados.
import { situacaoDaConfirmacao } from './situacao-da-confirmacao.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

const agora = new Date('2026-11-03T13:00:00Z') // 10h em Sao Paulo
const amanha = '2026-11-04T18:20:00Z'
const base = { startsAt: amanha, confirmada: false, pediuRemarcar: false, lembretes: 0, falhas: 0, motivoDaFalha: null }

// Real 03/11: duas tentativas para um numero com digitos a mais, as duas
// "Message undeliverable", e a faixa dizia "lembrete ainda nao enviado".
const falhou = situacaoDaConfirmacao({ ...base, falhas: 2, motivoDaFalha: 'Message undeliverable' }, agora)
confere('lembrete que falhou nao vira "ainda nao enviado"', !/ainda não enviado/.test(falhou.texto), falhou.texto)
confere('a faixa diz que nao chegou e quantas vezes', /não chegou: falhou 2 vezes/.test(falhou.texto), falhou.texto)
confere('com o motivo da Meta', /Message undeliverable/.test(falhou.texto), falhou.texto)
confere('em vermelho', falhou.tom === 'erro', falhou.tom)
confere('uma falha no singular', /falhou 1 vez\b/.test(situacaoDaConfirmacao({ ...base, falhas: 1 }, agora).texto))

const entregue = situacaoDaConfirmacao({ ...base, lembretes: 1, falhas: 1 }, agora)
confere('se um chegou depois de uma falha, vale o que chegou', /sem resposta ao lembrete \(enviado 1 vez\)/.test(entregue.texto), entregue.texto)
confere('confirmada ganha de tudo', situacaoDaConfirmacao({ ...base, confirmada: true, falhas: 3 }, agora).tom === 'ok')
confere('pediu remarcar em vermelho', situacaoDaConfirmacao({ ...base, pediuRemarcar: true }, agora).texto === 'pediu para remarcar')
confere('vespera sem envio: ainda nao enviado', situacaoDaConfirmacao(base, agora).texto === 'lembrete ainda não enviado')
confere('consulta longe: sai na vespera',
  situacaoDaConfirmacao({ ...base, startsAt: '2026-11-25T17:00:00Z' }, agora).texto === 'o lembrete sai na véspera')

console.log(`situacao da confirmacao: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}
