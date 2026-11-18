// A linha de quem escreve, embaixo do nome do paciente (porte de 18/11/2026).
// Regras em src/lib/quem-escreve.ts. Nomes e numeros inventados.
import assert from 'node:assert/strict'
import { linhaDeQuemEscreve, chaveDoTelefone } from './quem-escreve.build.mjs'

let casos = 0
const caso = (nome, fn) => {
  try {
    fn()
    casos++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

caso('acompanhante do cadastro aparece', () => {
  assert.equal(linhaDeQuemEscreve({ acompanhante: 'Marta Souza', nomeDoPaciente: 'Joao Souza' }), 'Acompanhante: Marta Souza')
})
caso('sem acompanhante, linha vazia', () => {
  assert.equal(linhaDeQuemEscreve({ acompanhante: '  ', nomeDoPaciente: 'Joao Souza' }), '')
  assert.equal(linhaDeQuemEscreve({}), '')
})
caso('acompanhante igual ao paciente nao repete', () => {
  assert.equal(linhaDeQuemEscreve({ acompanhante: 'joão souza ', nomeDoPaciente: 'Joao Souza' }), '')
})
caso('segundo telefone: rotulo e nome do WhatsApp, nao o acompanhante do cadastro', () => {
  assert.equal(
    linhaDeQuemEscreve({ acompanhante: 'Marta Souza', quemE: 'Cuidador(a)', nomeNoWhatsApp: 'Carla', nomeDoPaciente: 'Joao Souza' }),
    'Cuidador(a): Carla',
  )
})
caso('segundo telefone sem apelido util fica so o rotulo', () => {
  assert.equal(linhaDeQuemEscreve({ quemE: 'Filho', nomeNoWhatsApp: '', nomeDoPaciente: 'Joao' }), 'Filho')
  assert.equal(linhaDeQuemEscreve({ quemE: 'Filho', nomeNoWhatsApp: '.', nomeDoPaciente: 'Joao' }), 'Filho')
  assert.equal(linhaDeQuemEscreve({ quemE: 'Filho', nomeNoWhatsApp: '❤️🌻', nomeDoPaciente: 'Joao' }), 'Filho')
  assert.equal(linhaDeQuemEscreve({ quemE: 'Filho', nomeNoWhatsApp: '13 99999', nomeDoPaciente: 'Joao' }), 'Filho')
})
caso('apelido igual ao nome do paciente nao vira nome da filha', () => {
  assert.equal(linhaDeQuemEscreve({ quemE: 'Filha', nomeNoWhatsApp: 'João Souza', nomeDoPaciente: 'Joao Souza' }), 'Filha')
})
caso('chave casa pelos 8 ultimos digitos, com ou sem 55 e nono digito', () => {
  assert.equal(chaveDoTelefone('p1', '5513991234567'), chaveDoTelefone('p1', '(13) 9123-4567'))
  assert.notEqual(chaveDoTelefone('p1', '5513991234567'), chaveDoTelefone('p2', '5513991234567'))
  assert.notEqual(chaveDoTelefone('p1', '5513991234567'), chaveDoTelefone('p1', '5513991234568'))
})

console.log(`quem-escreve.test: ${casos} casos ok`)
