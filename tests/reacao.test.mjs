// Reacao a mensagem do paciente (porte de 18/11/2026).
// Regras em supabase/functions/_shared/reacao.ts. Dados inventados.
import assert from 'node:assert/strict'
import { conteudoDaReacao, proximaReacao, reacaoValida, recusaDaReacao, REACOES } from './reacao.build.mjs'

let ok = 0
function caso(nome, fn) {
  try {
    fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

caso('reacao da lista passa; vazio tira; o resto nao vai', () => {
  for (const emoji of REACOES) assert.equal(reacaoValida(emoji), emoji)
  assert.equal(reacaoValida(' 👍 '), '👍')
  assert.equal(reacaoValida(''), '', 'vazio e o pedido de tirar a reacao')
  assert.equal(reacaoValida('   '), '')
  assert.equal(reacaoValida('🖕'), null, 'emoji fora da lista nao sai em nome do consultorio')
  assert.equal(reacaoValida('ok'), null)
  assert.equal(reacaoValida('👍👍'), null)
  assert.equal(reacaoValida(null), null)
  assert.equal(reacaoValida(undefined), null)
  assert.equal(reacaoValida(7), null)
})

caso('so reage a mensagem recebida que a Meta conhece', () => {
  assert.equal(recusaDaReacao({ direction: 'inbound', external_message_id: 'wamid.ABC' }), null)
  assert.match(recusaDaReacao(null), /não é desta conversa/)
  assert.match(recusaDaReacao({ direction: 'outbound', external_message_id: 'wamid.ABC' }), /que o paciente mandou/)
  assert.match(recusaDaReacao({ direction: 'inbound', external_message_id: null }), /antiga demais/)
  assert.match(recusaDaReacao({ direction: 'inbound', external_message_id: '  ' }), /antiga demais/)
})

caso('o pedido a Meta leva o numero da mensagem e o emoji', () => {
  assert.deepEqual(conteudoDaReacao('wamid.ABC', '👍'), {
    type: 'reaction',
    reaction: { message_id: 'wamid.ABC', emoji: '👍' },
  })
  assert.equal(conteudoDaReacao('wamid.ABC', '').reaction.emoji, '', 'vazio tira a reacao na Meta')
})

caso('tocar na reacao que ja esta tira; em outra, troca', () => {
  assert.equal(proximaReacao(null, '👍'), '👍')
  assert.equal(proximaReacao('', '👍'), '👍')
  assert.equal(proximaReacao('👍', '👍'), '')
  assert.equal(proximaReacao('👍', '❤️'), '❤️')
})

caso('lista sem repeticao e dentro do tamanho que a coluna aceita', () => {
  assert.equal(new Set(REACOES).size, REACOES.length)
  for (const emoji of REACOES) assert.ok(emoji.length <= 16, 'a coluna reacao aceita ate 16 caracteres')
})

console.log(`reacao: ${ok} casos passaram`)
