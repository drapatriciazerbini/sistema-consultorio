// O nome do contato como o paciente e a familia podem ler (porte de 20/11/2026
// do sistema do Dr. Marcello, 17/11). Regra em
// supabase/functions/_shared/nome-para-familia.ts. Nomes inventados.
import assert from 'node:assert/strict'
import { nomeParaAFamilia } from './nome-para-familia.build.mjs'

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

caso('o recado da equipe depois do nome nao vai para o paciente', () => {
  assert.equal(nomeParaAFamilia('Dirce Teste - AGENDA FECHADA POR TEMPO INDETERMINADO'), 'Dirce Teste')
  assert.equal(nomeParaAFamilia('Antônio Teste de Paula (visita)'), 'Antônio Teste de Paula')
  assert.equal(nomeParaAFamilia('Lourdes Teste [retorno] | ligar antes'), 'Lourdes Teste')
  assert.equal(nomeParaAFamilia('Rosa Teste: nao confirmou'), 'Rosa Teste')
  assert.equal(nomeParaAFamilia('Rosa Teste / filha Rita'), 'Rosa Teste')
})

caso('nome de verdade passa inteiro', () => {
  assert.equal(nomeParaAFamilia('  Ana-Maria   de Souza  '), 'Ana-Maria de Souza')
  assert.equal(nomeParaAFamilia('Joao Avila Neto'), 'Joao Avila Neto')
})

caso('so recado, vazio ou nulo: melhor nada do que o recado', () => {
  assert.equal(nomeParaAFamilia('- ligar antes'), '')
  assert.equal(nomeParaAFamilia('(T)'), '')
  assert.equal(nomeParaAFamilia(''), '')
  assert.equal(nomeParaAFamilia(null), '')
})

console.log('nome para a familia: ' + ok + ' casos passaram')
