// Segunda via da receita pela Memed (src/lib/reimpressao.ts), 13/11/2026.
// Dados inventados.
import assert from 'node:assert/strict'
import { avisoDaReimpressao, idDaReceitaEmitida, idParaReabrir } from './reimpressao.build.mjs'

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

caso('numero da receita: no pacote da Memed ou solto, numero ou texto', () => {
  assert.equal(idDaReceitaEmitida({ prescricao: { id: 123456789 } }), '123456789')
  assert.equal(idDaReceitaEmitida({ prescricao: { id: ' 123456789 ' } }), '123456789')
  assert.equal(idDaReceitaEmitida({ id: 42 }), '42')
  assert.equal(idDaReceitaEmitida({ prescricao: {} }), null)
  assert.equal(idDaReceitaEmitida({ prescricao: { id: '' } }), null)
  assert.equal(idDaReceitaEmitida(null), null)
  assert.equal(idDaReceitaEmitida({ prescricao: { id: Number.NaN } }), null)
})

caso('so reabre com numero de verdade', () => {
  assert.equal(idParaReabrir('123456789'), '123456789')
  assert.equal(idParaReabrir(' 123456789 '), '123456789')
  assert.equal(idParaReabrir(''), null)
  assert.equal(idParaReabrir(null), null)
  assert.equal(idParaReabrir('abc'), null)
  assert.equal(idParaReabrir('12;drop'), null)
})

caso('mesma receita: segunda via, nada mudou', () => {
  const a = avisoDaReimpressao('123', { prescricao: { id: 123 } }, true)
  assert.equal(a.tipo, 'ok')
  assert.match(a.texto, /Segunda via/)
})

caso('numero diferente: receita nova, e o medico e avisado', () => {
  const assinado = avisoDaReimpressao('123', { prescricao: { id: 124 } }, true)
  assert.equal(assinado.tipo, 'info')
  assert.match(assinado.texto, /NOVA/)
  assert.match(assinado.texto, /adendo/, 'em atendimento assinado a receita nova fica fora do texto')
  const aberto = avisoDaReimpressao('123', { prescricao: { id: 124 } }, false)
  assert.equal(aberto.tipo, 'info')
  assert.doesNotMatch(aberto.texto, /adendo/)
  assert.match(aberto.texto, /Prescrição/)
})

caso('Memed sem numero no aviso: nao inventa receita nova', () => {
  assert.equal(avisoDaReimpressao('123', {}, true).tipo, 'ok')
})

for (const t of [avisoDaReimpressao('1', { id: 2 }, true), avisoDaReimpressao('1', { id: 2 }, false), avisoDaReimpressao('1', { id: 1 }, false)]) {
  caso('sem travessao nem meia-risca', () => assert.doesNotMatch(t.texto, /[–—]/))
}

console.log(`reimpressao: ${ok} casos passaram`)
