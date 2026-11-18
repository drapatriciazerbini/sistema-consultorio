// As cidades dos pacientes somadas e postas no mapa (18/11/2026, porte do
// sistema de origem). Nomes de cidade apenas: nenhum dado de paciente aqui.
import assert from 'node:assert/strict'
import { chaveDaCidade, cidadesDosPacientes } from './cidades-no-mapa.build.mjs'

let casos = 0
const caso = (nome, fn) => { fn(); casos++ }

caso('grafias da mesma cidade dao a mesma chave', () => {
  for (const g of ['Santos', 'SANTOS', ' santos ', 'Santos/SP', 'Santos - SP', 'santos, sp', 'Santos (SP)']) {
    assert.equal(chaveDaCidade(g), 'santos', g)
  }
  assert.equal(chaveDaCidade('Guarujá'), chaveDaCidade('GUARUJA'))
  assert.equal(chaveDaCidade('Praia  Grande'), chaveDaCidade('praia grande'))
})
caso('cidades diferentes nao se juntam', () => {
  assert.notEqual(chaveDaCidade('São Vicente'), chaveDaCidade('Santos'))
  // "sp" no meio do nome nao e o estado
  assert.equal(chaveDaCidade('Espirito Santo do Pinhal'), 'espirito santo do pinhal')
  // 18/11/2026: a linha de cima passava mesmo com o corte do estado valendo no
  // meio do nome (provado desligando a ancora de fim). Esta pega: hifen
  // seguido de "sp" so e o estado quando o nome termina ali.
  assert.equal(chaveDaCidade('Vila-Sperandio'), 'vila sperandio')
})
caso('o caso do print: Santos e Praia Grande repetidas viram uma linha cada', () => {
  const r = cidadesDosPacientes([
    'PRAIA GRANDE', 'PRAIA GRANDE', 'PRAIA GRANDE', 'PRAIA GRANDE', 'PRAIA GRANDE', 'Praia Grande', 'Praia Grande', 'Praia Grande',
    'SANTOS', 'SANTOS', 'SANTOS', 'SANTOS', 'Santos', 'Santos', 'Santos', 'Santos',
    'Guaruja', 'GUARUJÁ',
  ])
  assert.deepEqual(r.ranking, [['Praia Grande', 8], ['Santos', 8], ['Guarujá', 2]])
  assert.equal(r.fora, 0)
})
caso('vazio e nulo nao contam', () => {
  const r = cidadesDosPacientes(['', '   ', null, undefined, 'Santos'])
  assert.deepEqual(r.ranking, [['Santos', 1]])
})
caso('cidade fora do mapa fica no ranking e entra em "fora"', () => {
  const r = cidadesDosPacientes(['Campinas', 'campinas ', 'Santos', 'Registro'])
  assert.deepEqual(r.ranking, [['Campinas', 2], ['Registro', 1], ['Santos', 1]])
  assert.deepEqual(r.noMapa.map((c) => c.nome), ['Santos'])
  assert.equal(r.fora, 3)
})
caso('cidade do mapa vem com posicao e o nome certo', () => {
  const [c] = cidadesDosPacientes(['sao vicente']).noMapa
  assert.equal(c.nome, 'São Vicente')
  assert.ok(c.lon < -46 && c.lon > -47.2 && c.lat < -23.4 && c.lat > -24.5)
  assert.equal(c.n, 1)
})
caso('ordem: maior primeiro, empate em ordem alfabetica', () => {
  const r = cidadesDosPacientes(['Santos', 'Cubatão', 'Guarujá', 'Guarujá'])
  assert.deepEqual(r.ranking.map((x) => x[0]), ['Guarujá', 'Cubatão', 'Santos'])
})

console.log(`cidades-no-mapa.test: ${casos} casos ok`)
