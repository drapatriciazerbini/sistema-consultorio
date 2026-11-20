// Lembrete para quem acabou de marcar: espera o meio do caminho e a primeira
// meia hora (porte de 20/11/2026 do sistema do Dr. Marcello, 13/11 e 17/11).
// Regras em supabase/functions/_shared/lembrete-envio.ts.
import assert from 'node:assert/strict'
import { acabouDeMarcar, esperarOMeioDoCaminho } from './lembrete-envio.build.mjs'

const SP = 'America/Sao_Paulo'
const emSP = (texto) => new Date(texto + '-03:00').getTime()
const iso = (texto) => new Date(texto + '-03:00').toISOString()
// As passadas de verdade: 9h as 20h, e a consulta a mais de 2 horas.
const PASSADAS = { horaInicial: 9, horaFinal: 20, antecedenciaMinimaHoras: 2 }
const espera = (marcada, consulta, agora) =>
  esperarOMeioDoCaminho({ marcadaEm: iso(marcada), comecaEm: iso(consulta) }, emSP(agora), SP, PASSADAS)

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

caso('a Dra. confirmou as 18h14 a consulta das 14h30 de amanha: a passada das 18h20 espera', () => {
  assert.equal(espera('2026-11-13T18:14:00', '2026-11-14T14:30:00', '2026-11-13T18:20:00'), true)
  assert.equal(espera('2026-11-13T18:14:00', '2026-11-14T14:30:00', '2026-11-13T19:20:00'), true)
})

caso('o mesmo caso: na manha seguinte ja passou do meio (4h22) e o lembrete sai', () => {
  assert.equal(espera('2026-11-13T18:14:00', '2026-11-14T14:30:00', '2026-11-14T09:20:00'), false)
})

caso('marcou de manha para a tarde: espera ate o meio, sai depois dele', () => {
  // 9h -> 17h: o meio e 13h.
  assert.equal(espera('2026-11-13T09:00:00', '2026-11-13T17:00:00', '2026-11-13T09:20:00'), true)
  assert.equal(espera('2026-11-13T09:00:00', '2026-11-13T17:00:00', '2026-11-13T12:20:00'), true)
  assert.equal(espera('2026-11-13T09:00:00', '2026-11-13T17:00:00', '2026-11-13T13:20:00'), false)
})

caso('quem marcou ha uma semana nao muda: a vespera ja passou do meio', () => {
  assert.equal(espera('2026-11-06T10:00:00', '2026-11-14T10:00:00', '2026-11-13T09:20:00'), false)
})

caso('esperar nunca custa o lembrete: sem passada boa depois do meio, sai agora', () => {
  // 17h -> 9h de amanha: o meio e 1h da manha, e a passada das 9h20 ja e depois da consulta.
  assert.equal(espera('2026-11-13T17:00:00', '2026-11-14T09:00:00', '2026-11-13T17:20:00'), false)
  // 19h -> 11h de amanha: o meio e 3h; a unica passada depois (9h20) fica a menos de 2h da consulta.
  assert.equal(espera('2026-11-13T19:00:00', '2026-11-14T11:00:00', '2026-11-13T19:20:00'), false)
  // 19h -> 12h de amanha: a passada das 9h20 ainda da 2h40 de antecedencia.
  assert.equal(espera('2026-11-13T19:00:00', '2026-11-14T12:00:00', '2026-11-13T19:20:00'), true)
})

caso('passada de madrugada nao conta como passada boa', () => {
  // 15h -> 8h de amanha: depois do meio (23h30) so ha madrugada ate as 6h.
  assert.equal(espera('2026-11-13T15:00:00', '2026-11-14T08:00:00', '2026-11-13T15:20:00'), false)
})

caso('data ilegivel ou consulta antes da marcacao: o lembrete sai como sempre', () => {
  const agora = emSP('2026-11-13T18:20:00')
  assert.equal(esperarOMeioDoCaminho({ marcadaEm: null, comecaEm: iso('2026-11-14T14:30:00') }, agora, SP, PASSADAS), false)
  assert.equal(esperarOMeioDoCaminho({ marcadaEm: 'ontem', comecaEm: iso('2026-11-14T14:30:00') }, agora, SP, PASSADAS), false)
  assert.equal(esperarOMeioDoCaminho({ marcadaEm: iso('2026-11-13T18:14:00'), comecaEm: 'x' }, agora, SP, PASSADAS), false)
  assert.equal(esperarOMeioDoCaminho({ marcadaEm: iso('2026-11-14T18:14:00'), comecaEm: iso('2026-11-14T14:30:00') }, agora, SP, PASSADAS), false)
})

// Remarcou as 14h18 para as 17h20 e o lembrete chegou as 14h20, no meio do
// cadastro. O meio do caminho deixa passar (nao ha passada boa depois dele);
// a meia hora segura.
caso('acabou de marcar: na primeira meia hora o lembrete nao sai, depois sai', () => {
  assert.equal(espera('2026-11-17T14:18:00', '2026-11-17T17:20:00', '2026-11-17T14:20:00'), false, 'o meio do caminho nao segura este caso')
  assert.equal(acabouDeMarcar(iso('2026-11-17T14:18:00'), emSP('2026-11-17T14:20:00')), true)
  assert.equal(acabouDeMarcar(iso('2026-11-17T14:18:00'), emSP('2026-11-17T14:47:59')), true)
  assert.equal(acabouDeMarcar(iso('2026-11-17T14:18:00'), emSP('2026-11-17T14:48:00')), false)
  assert.equal(acabouDeMarcar(iso('2026-11-17T14:18:00'), emSP('2026-11-17T15:20:00')), false)
})

caso('acabou de marcar: data ilegivel ou no futuro nao segura o lembrete', () => {
  assert.equal(acabouDeMarcar(null, emSP('2026-11-17T14:20:00')), false)
  assert.equal(acabouDeMarcar('ontem', emSP('2026-11-17T14:20:00')), false)
  assert.equal(acabouDeMarcar(iso('2026-11-17T15:00:00'), emSP('2026-11-17T14:20:00')), false)
})

console.log('meio do caminho: ' + ok + ' casos passaram')
