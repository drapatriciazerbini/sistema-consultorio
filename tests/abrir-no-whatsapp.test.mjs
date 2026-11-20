// "Abrir no meu WhatsApp" (porte de 20/11/2026 do sistema do Dr. Marcello,
// 17/11): o endereco que vira QR code. Numeros inventados, nenhum e de paciente.
import assert from 'node:assert/strict'
import { linkDoWhatsApp, numeroNacional } from './abrir-no-whatsapp.build.mjs'

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

caso('celular com mascara ganha o 55', () => {
  assert.equal(linkDoWhatsApp('(13) 9 8888-7777'), 'https://wa.me/5513988887777')
  assert.equal(numeroNacional('(13) 9 8888-7777'), '13988887777')
})
caso('numero que ja vem com 55 nao ganha outro', () => {
  assert.equal(linkDoWhatsApp('5513988887777'), 'https://wa.me/5513988887777')
  assert.equal(linkDoWhatsApp('+55 (13) 98888-7777'), 'https://wa.me/5513988887777')
  assert.equal(numeroNacional('5513988887777'), '13988887777')
})
caso('telefone fixo de 8 digitos, com e sem 55', () => {
  assert.equal(linkDoWhatsApp('(13) 3222-7777'), 'https://wa.me/551332227777')
  assert.equal(linkDoWhatsApp('551332227777'), 'https://wa.me/551332227777')
})
caso('DDD 55 (Santa Maria) sem DDI nao e confundido com o codigo do pais', () => {
  assert.equal(linkDoWhatsApp('(55) 9 8888-7777'), 'https://wa.me/5555988887777')
  assert.equal(linkDoWhatsApp('(55) 8888-7777'), 'https://wa.me/555588887777')
})
caso('numero incompleto ou vazio nao vira endereco', () => {
  assert.equal(linkDoWhatsApp('98888-7777'), null)
  assert.equal(linkDoWhatsApp(''), null)
  assert.equal(linkDoWhatsApp(null), null)
  assert.equal(linkDoWhatsApp('55139888877771234'), null)
  assert.equal(numeroNacional('98888-7777'), '')
})
caso('o endereco nao leva texto pronto', () => {
  assert.ok(!linkDoWhatsApp('(13) 9 8888-7777').includes('?'))
})

console.log('abrir no whatsapp: ' + ok + ' casos passaram')
